describe('snapshotProject', function() {
  const proxyquire =  require('proxyquire').noCallThru();
  const path = require('path');
  let fsStub, packageStub, stubs, snapshotProject = null;

  beforeEach(function() {
    // Set up Proxyquire
    fsStub = { writeFile: jasmine.createSpy('writeFile') };
    packageStub = {};

    stubs = {};
    stubs.fs = fsStub;
    stubs[path.join(process.cwd(), 'package.json')] = packageStub;

    snapshotProject = proxyquire('../lib/snapshotProject', stubs).action;
  });

  function verifyUpdatedVersion(expectedVersion) {
    expect(fsStub.writeFile).toHaveBeenCalledWith(
      'package.json',
      JSON.stringify(
        { 'version': expectedVersion },
        null,
        2
      ),
      'utf8',
      jasmine.any(Function)
    );
  }

  afterEach(function() {
    fsStub.writeFile.calls.reset();
  });

  describe('prerelease snapshot', function() {
    it('should should be the default option', function() {
      packageStub.version = '1.2.3';
      snapshotProject(4, 'alpha', {});
      verifyUpdatedVersion('1.2.4-alpha.4');
    });

    it('should append the tag and buildNumber to the package version and increment the patch version', function() {
      packageStub.version = '1.2.3';
      snapshotProject(4, 'alpha', { 'prerelease': true });
      verifyUpdatedVersion('1.2.4-alpha.4');
    });

    it('should increment the patch version even if there is no major version', function() {
      packageStub.version = '0.2.3';
      snapshotProject(4, 'alpha', { 'prerelease': true });
      verifyUpdatedVersion('0.2.4-alpha.4');
    });

    it('should increment the patch version even if there is no minor version', function() {
      packageStub.version = '0.0.3';
      snapshotProject(4, 'alpha', { 'prerelease': true });
      verifyUpdatedVersion('0.0.4-alpha.4');
    });

    it('should increment the patch version even if there is no patch version', function() {
      packageStub.version = '0.0.0';
      snapshotProject(4, 'alpha', { 'prerelease': true });
      verifyUpdatedVersion('0.0.1-alpha.4');
    });

    it('should remove slashes from the tag name', function() {
      packageStub.version = '0.0.0';
      snapshotProject(4, 'feature/alpha', { 'prerelease': true });
      verifyUpdatedVersion('0.0.1-alpha.4');
    });

    it('should return the last substring from the tag name if there are multiple slashes', function() {
      packageStub.version = '0.0.0';
      snapshotProject(4, 'my/feature/alpha', { 'prerelease': true });
      verifyUpdatedVersion('0.0.1-alpha.4');
    });

    it('should throw an error if the user does not provide a tag', function() {
      let testFunction = function() {
        snapshotProject(4, undefined, { 'prerelease': true });
      };

      expect(testFunction).toThrow('A tag is necessary for prerelease snapshots!');
    });
  });

  describe('patch snapshot', function() {
    it('should set the patch version to be the buildNumber', function() {
      packageStub.version = '1.2.3';
      snapshotProject(4, undefined, { 'patch': true });
      verifyUpdatedVersion('1.2.4');
    });

    it('should set the patch version to be the buildNumber even if there is no major version', function() {
      packageStub.version = '0.2.3';
      snapshotProject(4, undefined, { 'patch': true });
      verifyUpdatedVersion('0.2.4');
    });

    it('should set the patch version to be the buildNumber even if there is no minor version', function() {
      packageStub.version = '0.0.3';
      snapshotProject(4, undefined, { 'patch': true });
      verifyUpdatedVersion('0.0.4');
    });

    it('should set the patch version to be the buildNumber even if there is no patch version', function() {
      packageStub.version = '0.0.0';
      snapshotProject(4, undefined, { 'patch': true });
      verifyUpdatedVersion('0.0.4');
    });

    it('should ignore the tag if one is provided', function() {
      packageStub.version = '1.2.3';
      snapshotProject(4, 'alpha', { 'patch': true });
      verifyUpdatedVersion('1.2.4');
    });
  });
});
