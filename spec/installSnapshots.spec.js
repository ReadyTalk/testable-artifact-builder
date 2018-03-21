describe('installSnapshots', function() {
  const chalk = require('chalk');
  const proxyquire =  require('proxyquire').noCallThru();
  const path = require('path');
  const EventEmitter = require('events');

  let dependenciesStub, fsStub, dependenciesPath, emitter, shrinkwrapStub,
      childProcessStub, packageStub, stubs, installSnapshots = null;

  beforeEach(function() {
    // Set up Proxyquire
    fsStub = {
      writeFileSync: jasmine.createSpy('writeFileSync')
    };
    dependenciesStub = [];
    dependenciesPath = 'some/path/file.json';
    emitter = new EventEmitter();
    spyOn(emitter, 'on').and.callThrough();
    childProcessStub = {
      spawn: jasmine.createSpy('spawn').and.returnValue(emitter),
      spawnSync: jasmine.createSpy('spawnSync')
    }
    packageStub = { dependencies: {} };
    shrinkwrapStub = { dependencies: {} };

    stubs = {};
    stubs.fs = fsStub;
    stubs[path.join(process.cwd(), dependenciesPath)] = dependenciesStub;
    stubs[path.join(process.cwd(), 'package.json')] = packageStub;
    stubs[path.join(process.cwd(), 'npm-shrinkwrap.json')] = shrinkwrapStub;
    stubs.child_process = childProcessStub;

    installSnapshots = proxyquire('../lib/installSnapshots', stubs);

    // Set up additional spies
    spyOn(console, 'error');
    spyOn(console, 'log');
    spyOn(JSON, 'stringify').and.callThrough();
  });

  afterEach(function() {
    fsStub.writeFileSync.calls.reset();
    childProcessStub.spawnSync.calls.reset();
    dependenciesStub.length = 0;
  });

  describe('updateChildDependencies', function() {
    it('should log an error if an error occurs trying to find dist-tags for a dependency', function() {
      dependenciesStub.push('dep1');
      childProcessStub.spawnSync.and.returnValue({ error: 'kaboom'});

      installSnapshots.updateChildDependencies(dependenciesPath, 'alpha');
      expect(console.error).toHaveBeenCalledWith('Error checking tags for', 'dep1', ':', 'kaboom');
    });

    it('should not rewrite the package.json if all dist-tag checks error out', function() {
      dependenciesStub.push('dep1');
      dependenciesStub.push('dep2');
      childProcessStub.spawnSync.and.returnValue({ error: 'kaboom'});

      installSnapshots.updateChildDependencies(dependenciesPath, 'alpha');
      expect(console.error.calls.count()).toEqual(2);
      expect(fsStub.writeFileSync).not.toHaveBeenCalled();
      expect(childProcessStub.spawn).toHaveBeenCalledWith('npm', ['install'], { stdio: 'inherit', shell: true })
    });

    it('should log an error if there are no dist-tags for a dependency', function() {
      dependenciesStub.push('dep1');
      childProcessStub.spawnSync.and.returnValue({ stdout: ''});

      installSnapshots.updateChildDependencies(dependenciesPath, 'alpha');
      expect(console.error).toHaveBeenCalledWith(
        'No version specified for tag',
        chalk.bold('alpha'),
        'in dependency',
        chalk.bold('dep1'),
        '. No modification was made to package.json for this dependency.'
      );
    });

    it('should not rewrite the package.json if there are no dist-tag for any dependency', function() {
      dependenciesStub.push('dep1');
      dependenciesStub.push('dep2');
      childProcessStub.spawnSync.and.returnValue({ stdout: ''});

      installSnapshots.updateChildDependencies(dependenciesPath, 'alpha');
      expect(console.error.calls.count()).toEqual(2);
      expect(fsStub.writeFileSync).not.toHaveBeenCalled();
      expect(childProcessStub.spawn).toHaveBeenCalledWith('npm', ['install'], { stdio: 'inherit', shell: true })
    });

    it('should rewrite the package.json file if a dependency matches the tag', function() {
      dependenciesStub.push('dep1');
      childProcessStub.spawnSync.and.callFake(function() {
        return { stdout: '1.1.1-alpha.1'};
      });

      installSnapshots.updateChildDependencies(dependenciesPath, 'alpha');
      expect(fsStub.writeFileSync).toHaveBeenCalledWith(
        'package.json',
        JSON.stringify(
          { "dependencies": { "dep1": "1.1.1-alpha.1" } },
          null,
          2
        ),
        'utf8',
        jasmine.any(Function)
      );
      expect(childProcessStub.spawn).toHaveBeenCalledWith('npm', ['install'], { stdio: 'inherit', shell: true })
    });

    it('should rewrite the package.json file for all dependencies that match the tag', function() {
      dependenciesStub.push('dep1');
      dependenciesStub.push('dep2');
      childProcessStub.spawnSync.and.callFake(function() {
        if(childProcessStub.spawnSync.calls.count() === 1) {
          return { stdout: '1.1.1-alpha.1'};
        } else {
          return { stdout: '2.2.2-alpha.2'};
        }
      });

      installSnapshots.updateChildDependencies(dependenciesPath, 'alpha');
      expect(fsStub.writeFileSync).toHaveBeenCalledWith(
        'package.json',
        JSON.stringify(
          {
            "dependencies": {
              "dep1": "1.1.1-alpha.1",
              "dep2": "2.2.2-alpha.2"
            }
          },
          null,
          2
        ),
        'utf8',
        jasmine.any(Function)
      );
    });

    it('should proceed with other dependencies even if some have problems', function(done) {
      dependenciesStub.push('dep1');
      dependenciesStub.push('dep2');
      dependenciesStub.push('dep3');
      childProcessStub.spawnSync.and.callFake(function() {
        if(childProcessStub.spawnSync.calls.count() === 1) {
          return { error: 'kaboom'};
        } else if(childProcessStub.spawnSync.calls.count() === 2) {
          return { stdout: ''};
        } else {
          return { stdout: '3.3.3-alpha.3'};
        }
      });

      installSnapshots.updateChildDependencies(dependenciesPath, 'alpha').then(function(modified) {
        expect(console.error.calls.count()).toEqual(2);
        expect(fsStub.writeFileSync).toHaveBeenCalledWith(
          'package.json',
          JSON.stringify(
            { "dependencies": { "dep3": "3.3.3-alpha.3" } },
            null,
            2
          ),
          'utf8',
          jasmine.any(Function)
        );

        expect(childProcessStub.spawn).toHaveBeenCalledWith(
          'npm',
          ['install'],
          { stdio: 'inherit', shell: true }
        );

        expect(emitter.on).toHaveBeenCalledWith(
          'close',
          jasmine.any(Function)
        );

        expect(modified).toEqual([{ name: 'dep3', version: '3.3.3-alpha.3' }]);
        done();
      });

      emitter.emit('close');
    });

    // Unlike a version, a dist tag in npm can contain slashes. Therefore, installSnapshots should not strip them out.
    it('should not strip any slashes out of the tag', function() {
      dependenciesStub.push('dep1');
      childProcessStub.spawnSync.and.callFake(function() {
        return { stdout: '1.1.1-alpha.1'};
      });

      installSnapshots.updateChildDependencies(dependenciesPath, 'my/feature/alpha');
      expect(childProcessStub.spawnSync).toHaveBeenCalledWith('npm', ['show', 'dep1', 'dist-tags.my/feature/alpha'], { shell: true });
    });
  });

  describe('generateShrinkwrap', function() {
    it('should generate a shrinkwrap file', function(done) {
      installSnapshots.generateShrinkwrap().then(function() {
        expect(childProcessStub.spawn).toHaveBeenCalledWith('npm', ['shrinkwrap'], { stdio: 'inherit', shell: true });
        done();
      });

      emitter.emit('close');
    });
  });

  describe('updateTransitiveDependencies', function() {
    let modified = [
      {
        name: 'dep1',
        version: '1.1.1-alpha.1'
      },
      {
        name: 'dep2',
        version: '2.2.2-alpha.2'
      },
      {
        name: 'dep3',
        version: '3.3.3-alpha.3'
      }
    ]

    it('should not rewrite the shrinkwrap file or execture another install', function(){
      shrinkwrapStub.dependencies.dep1 = {};
      shrinkwrapStub.dependencies.dep2 = {};
      shrinkwrapStub.dependencies.dep3 = {};

      installSnapshots.updateTransitiveDependencies(modified);
      expect(fsStub.writeFileSync).not.toHaveBeenCalled();
      expect(childProcessStub.spawnSync).not.toHaveBeenCalled();
    });

    it('should rewrite the shrinkwrap file for a modified child dependency that has a transitive dependency to be updated', function() {
      shrinkwrapStub.dependencies.dep1 = {};
      shrinkwrapStub.dependencies.dep2 = {};
      shrinkwrapStub.dependencies.dep3 = {
        dependencies: {
          dep1: {
            version: '1.1.0',
            from: "dep1@>=1.1.0 <2.0.0",
            resolved: "http://my.npm.repo/dep1/-/dep1-1.1.0.tgz",
          },
          otherDep: {
            version: '2.3.4',
            from: "otherDep@>=1.0.0 <2.0.0",
            resolved: "http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz",
          }
        }
      };

      installSnapshots.updateTransitiveDependencies(modified);
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.version).toEqual('1.1.1-alpha.1');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.from).toEqual('dep1@>=1.1.1-alpha.1 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.resolved).toEqual('http://my.npm.repo/dep1/-/dep1-1.1.1-alpha.1.tgz');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.version).toEqual('2.3.4');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.from).toEqual('otherDep@>=1.0.0 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.resolved).toEqual('http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz');
      expect(fsStub.writeFileSync).toHaveBeenCalledWith(
        'npm-shrinkwrap.json',
        JSON.stringify(shrinkwrapStub, null, 2),
        'utf8',
        jasmine.any(Function)
      );
      expect(childProcessStub.spawnSync).toHaveBeenCalledWith('npm', ['install'], { stdio: 'inherit', shell: true });
    });

    it('should rewrite the shrinkwrap file for a modified child dependency that has multiple transitive dependency to be updated', function() {
      shrinkwrapStub.dependencies.dep1 = {};
      shrinkwrapStub.dependencies.dep2 = {};
      shrinkwrapStub.dependencies.dep3 = {
        dependencies: {
          dep1: {
            version: '1.1.0',
            from: "dep1@>=1.1.0 <2.0.0",
            resolved: "http://my.npm.repo/dep1/-/dep1-1.1.0.tgz",
          },
          dep2: {
            version: '2.2.1',
            from: "dep2@>=2.2.1 <2.0.0",
            resolved: "http://my.npm.repo/dep2/-/dep2-2.2.1.tgz",
          },
          otherDep: {
            version: '2.3.4',
            from: "otherDep@>=1.0.0 <2.0.0",
            resolved: "http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz",
          }
        }
      };

      installSnapshots.updateTransitiveDependencies(modified);
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.version).toEqual('1.1.1-alpha.1');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.from).toEqual('dep1@>=1.1.1-alpha.1 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.resolved).toEqual('http://my.npm.repo/dep1/-/dep1-1.1.1-alpha.1.tgz');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep2.version).toEqual('2.2.2-alpha.2');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep2.from).toEqual('dep2@>=2.2.2-alpha.2 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep2.resolved).toEqual('http://my.npm.repo/dep2/-/dep2-2.2.2-alpha.2.tgz');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.version).toEqual('2.3.4');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.from).toEqual('otherDep@>=1.0.0 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.resolved).toEqual('http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz');
      expect(fsStub.writeFileSync).toHaveBeenCalledWith(
        'npm-shrinkwrap.json',
        JSON.stringify(shrinkwrapStub, null, 2),
        'utf8',
        jasmine.any(Function)
      );
      expect(childProcessStub.spawnSync).toHaveBeenCalledWith('npm', ['install'], { stdio: 'inherit', shell: true });
    });

    it('should rewrite the shrinkwrap file for all modified child dependencies that have a transitive dependency to be updated', function() {
      shrinkwrapStub.dependencies.dep1 = {};
      shrinkwrapStub.dependencies.dep2 = {
        dependencies: {
          dep1: {
            version: '1.1.0',
            from: "dep1@>=1.1.0 <2.0.0",
            resolved: "http://my.npm.repo/dep1/-/dep1-1.1.0.tgz",
          },
          otherDep: {
            version: '2.3.4',
            from: "otherDep@>=1.0.0 <2.0.0",
            resolved: "http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz",
          }
        }
      };
      shrinkwrapStub.dependencies.dep3 = {
        dependencies: {
          dep1: {
            version: '1.1.0',
            from: "dep1@>=1.1.0 <2.0.0",
            resolved: "http://my.npm.repo/dep1/-/dep1-1.1.0.tgz",
          },
          otherDep: {
            version: '2.3.4',
            from: "otherDep@>=1.0.0 <2.0.0",
            resolved: "http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz",
          }
        }
      };

      installSnapshots.updateTransitiveDependencies(modified);
      expect(shrinkwrapStub.dependencies.dep2.dependencies.dep1.version).toEqual('1.1.1-alpha.1');
      expect(shrinkwrapStub.dependencies.dep2.dependencies.dep1.from).toEqual('dep1@>=1.1.1-alpha.1 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep2.dependencies.dep1.resolved).toEqual('http://my.npm.repo/dep1/-/dep1-1.1.1-alpha.1.tgz');
      expect(shrinkwrapStub.dependencies.dep2.dependencies.otherDep.version).toEqual('2.3.4');
      expect(shrinkwrapStub.dependencies.dep2.dependencies.otherDep.from).toEqual('otherDep@>=1.0.0 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep2.dependencies.otherDep.resolved).toEqual('http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.version).toEqual('1.1.1-alpha.1');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.from).toEqual('dep1@>=1.1.1-alpha.1 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.resolved).toEqual('http://my.npm.repo/dep1/-/dep1-1.1.1-alpha.1.tgz');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.version).toEqual('2.3.4');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.from).toEqual('otherDep@>=1.0.0 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.resolved).toEqual('http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz');
      expect(fsStub.writeFileSync).toHaveBeenCalledWith(
        'npm-shrinkwrap.json',
        JSON.stringify(shrinkwrapStub, null, 2),
        'utf8',
        jasmine.any(Function)
      );
      expect(childProcessStub.spawnSync).toHaveBeenCalledWith('npm', ['install'], { stdio: 'inherit', shell: true });
    });

    it('should not rewrite the shrinkwrap file for a child dependencies that has not been modified', function() {
      shrinkwrapStub.dependencies.dep1 = {};
      shrinkwrapStub.dependencies.dep2 = {};
      shrinkwrapStub.dependencies.dep3 = {
        dependencies: {
          dep1: {
            version: '1.1.0',
            from: "dep1@>=1.1.0 <2.0.0",
            resolved: "http://my.npm.repo/dep1/-/dep1-1.1.0.tgz",
          },
          otherDep: {
            version: '2.3.4',
            from: "otherDep@>=1.0.0 <2.0.0",
            resolved: "http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz",
          }
        }
      };
      shrinkwrapStub.dependencies.dep4 = {
        dependencies: {
          dep1: {
            version: '1.1.0',
            from: "dep1@>=1.1.0 <2.0.0",
            resolved: "http://my.npm.repo/dep1/-/dep1-1.1.0.tgz",
          },
          otherDep: {
            version: '2.3.4',
            from: "otherDep@>=1.0.0 <2.0.0",
            resolved: "http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz",
          }
        }
      };

      installSnapshots.updateTransitiveDependencies(modified);
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.version).toEqual('1.1.1-alpha.1');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.from).toEqual('dep1@>=1.1.1-alpha.1 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.dep1.resolved).toEqual('http://my.npm.repo/dep1/-/dep1-1.1.1-alpha.1.tgz');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.version).toEqual('2.3.4');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.from).toEqual('otherDep@>=1.0.0 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep3.dependencies.otherDep.resolved).toEqual('http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz');
      expect(shrinkwrapStub.dependencies.dep4.dependencies.dep1.version).toEqual('1.1.0');
      expect(shrinkwrapStub.dependencies.dep4.dependencies.dep1.from).toEqual('dep1@>=1.1.0 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep4.dependencies.dep1.resolved).toEqual('http://my.npm.repo/dep1/-/dep1-1.1.0.tgz');
      expect(shrinkwrapStub.dependencies.dep4.dependencies.otherDep.version).toEqual('2.3.4');
      expect(shrinkwrapStub.dependencies.dep4.dependencies.otherDep.from).toEqual('otherDep@>=1.0.0 <2.0.0');
      expect(shrinkwrapStub.dependencies.dep4.dependencies.otherDep.resolved).toEqual('http://my.npm.repo/otherDep/-/otherDep-1.1.0.tgz');
      expect(fsStub.writeFileSync).toHaveBeenCalledWith(
        'npm-shrinkwrap.json',
        JSON.stringify(shrinkwrapStub, null, 2),
        'utf8',
        jasmine.any(Function)
      );
      expect(childProcessStub.spawnSync).toHaveBeenCalledWith('npm', ['install'], { stdio: 'inherit', shell: true });
    });
  });

  describe('action', function() {
    it('should call all functions in the correct order', function(done) {
      let modifiedStub = [ { name: 'dep1', version: '1.1.1-alpha.1' } ];

      spyOn(installSnapshots, 'updateChildDependencies').and.callFake(function() {
        expect(installSnapshots.generateShrinkwrap).not.toHaveBeenCalled();
        expect(installSnapshots.updateTransitiveDependencies).not.toHaveBeenCalled();
        return Promise.resolve(modifiedStub);
      });

      spyOn(installSnapshots, 'generateShrinkwrap').and.callFake(function() {
        expect(installSnapshots.updateTransitiveDependencies).not.toHaveBeenCalled();
        return Promise.resolve();
      });

      spyOn(installSnapshots, 'updateTransitiveDependencies').and.returnValue(Promise.resolve());

      installSnapshots.action(dependenciesPath, 'alpha').then(function() {
        expect(installSnapshots.updateChildDependencies).toHaveBeenCalled();
        expect(installSnapshots.generateShrinkwrap).toHaveBeenCalled();
        expect(installSnapshots.updateTransitiveDependencies).toHaveBeenCalledWith(modifiedStub);
        done();
      });
    });

    it('should exit if there is a problem installing modified dependencies', function(done) {
      let modifiedStub = [ { name: 'dep1', version: '1.1.1-alpha.1' } ];

      spyOn(installSnapshots, 'updateChildDependencies').and.returnValue(Promise.reject());
      spyOn(installSnapshots, 'generateShrinkwrap');
      spyOn(installSnapshots, 'updateTransitiveDependencies');

      installSnapshots.action(dependenciesPath, 'alpha').catch(function() {
        expect(installSnapshots.updateChildDependencies).toHaveBeenCalled();
        expect(installSnapshots.generateShrinkwrap).not.toHaveBeenCalled();
        expect(installSnapshots.updateTransitiveDependencies).not.toHaveBeenCalled();
        done();
      });
    });
  });
});
