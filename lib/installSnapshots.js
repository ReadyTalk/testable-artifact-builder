const { spawn, spawnSync } = require('child_process');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

function installSnapshots() {
  this.action = (dependenciesPath, tag) => {
    let modified = [];

    return this.updateChildDependencies(dependenciesPath, tag).then((m) => {
      modified = m;
      return this.generateShrinkwrap();
    }).then(() => {
      return this.updateTransitiveDependencies(modified);
    });
  };

  this.updateChildDependencies = function(dependenciesPath, tag) {
    let package = require(path.join(process.cwd(), 'package.json'));
    let dependencies = require(path.join(process.cwd(), dependenciesPath));
    let modified = [];

    // Check all deps in dependenciesPath file to verify they exist and have a dist-tag with the name tag
    dependencies.forEach(function(dep) {
      let tagChecker = spawnSync('npm', ['show', dep, 'dist-tags.' + tag], { shell: true });
      if (tagChecker.error && tagChecker.error.toString().trim()) {
        console.error('Error checking tags for', dep, ':', tagChecker.error.toString().trim());
      } else if (!tagChecker.stdout.toString().trim()) {
        console.error('No version specified for tag', chalk.bold(tag), 'in dependency', chalk.bold(dep), '. No modification was made to package.json for this dependency.');
      } else {
        let version = tagChecker.stdout.toString().trim();
        console.log('Updating dependency', dep, 'to version', version);
        package.dependencies[dep] = version;
        modified.push({
          name: dep,
          version: version
        });
      }
    });

    return new Promise(function(resolve, reject) {
      if (modified.length > 0) {
        // Rewrite package.json using tagged versions of dependencies
        fs.writeFileSync('package.json', JSON.stringify(package, null, 2), 'utf8', function(err) {
          if (err) {
            throw err;
          }
        });
      }

        // Install tagged versions of child dependencies using updated package.json file
        console.log('Installing new modules');
        let installer = spawn('npm', ['install'], { stdio: 'inherit', shell: true });
        installer.on('close', function() {
          resolve(modified)
        });
    });
  };

  this.generateShrinkwrap = function() {
    // Generate npm-shrinkwrap.json based on what versions were installed
    let wrapper = spawn('npm', ['shrinkwrap'], { stdio: 'inherit', shell: true });
    return new Promise(function(resolve, reject) {
      wrapper.on('close', resolve);
    });
  };

  this.updateTransitiveDependencies = function(modified) {
    // Update transitive dependencies of updated child dependencies in npm-shrinkwrap.json to use tagged versions
    // This is how we resolve complex dependency chains that are many levels deep
    let transitivesUpdated = false;
    let shrinkwrap = require(path.join(process.cwd(), 'npm-shrinkwrap.json'));
    modified.forEach(function(dep) {

      let transitives = shrinkwrap.dependencies[dep.name].dependencies;

      if (transitives) {
        transitivesUpdated = true;
        modified.forEach(function(dep) {
          Object.keys(transitives).forEach(function(key) {
            if (key === dep.name) {
              let oldVersion = transitives[dep.name].version;
              transitives[dep.name].version = dep.version;
              transitives[dep.name].from = transitives[dep.name].from.replace(oldVersion, dep.version);
              transitives[dep.name].resolved = transitives[dep.name].resolved .replace(oldVersion, dep.version);
            }
          });
        });
      }
    });

    if(transitivesUpdated) {
      // Rewrite npm-shrinkwrap.json using updated transitive dependencies
      fs.writeFileSync('npm-shrinkwrap.json', JSON.stringify(shrinkwrap, null, 2), 'utf8', function(err) {
        if (err) {
          throw err;
        }
      });

      // Install tagged versions of transitive dependencies using updated npm-shrinkwrap.json
      spawnSync('npm', ['install'], { stdio: 'inherit', shell: true });
      return Promise.resolve();
    }
  };

  this.description = `
                      Install snapshot version of all dependencies in the <dependenciesPath> file that have been published with <tag>.
                      ${chalk.bold('NOTE:')} This will override your package.json to prevent version errors. Do NOT commit this change to your repo.

                      ${chalk.bold('  dependenciesPath')}: a path to a JSON file containing all dependencies to install.
                      ${chalk.bold('  tag')}: the tag name used when publishing a snapshots of the dependencies to npm.
                      `
                      .replace(/^ */gm, '  ')
}

module.exports = new installSnapshots();

