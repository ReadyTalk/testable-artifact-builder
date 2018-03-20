const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const semver = require('semver');

function snapshotProject() {
  this.action = function(buildNumber, tag, cmd) {
    let package = require(path.join(process.cwd(), 'package.json'));

    if (cmd && cmd.patch) {
      // Resulting version syntax adheres to the patch syntax as defined by Semantic Versioning 2.0.0: https://semver.org/spec/v2.0.0.html#spec-item-6
      // Resulting version MAY OR MAY NOT have a higher precedence than the existing published release as defined by Semantic Versioning 2.0.0: http://semver.org/spec/v2.0.0.html#spec-item-11
      // Resulting version MAY have an incremented patch version but WILL NEVER have an incremented minor or major version
      //   - As such, resulting version MAY NOT adhere to the definition of a patch version as defined by Semantic Versioning 2.0.0: http://semver.org/spec/v2.0.0.html#spec-item-6
      //   - Developer should exercise good judgement when determining the proper version for a new release and should not rely on the resulting version as a guide
      var newVersion = `${semver.major(package.version)}.${semver.minor(package.version)}.${buildNumber}`;
      package.version = newVersion;
    } else {
      // Ensure a tag exists and is correctly formatted for prerelease snapshots
      if (!tag) {
        throw 'A tag is necessary for prerelease snapshots!'
      } else if (tag.indexOf('/') > -1) {
        // Remove any slashes from the tag name as npm will reject versions that contain slashes.
        // This is to handle the case where a branch is named something like "feature/my-new-feature"
        let substrings = tag.split('/');
        tag = substrings[substrings.length - 1];
      }

      // Resulting version syntax adheres to the pre-release syntax as defined by Semantic Versioning 2.0.0: http://semver.org/spec/v2.0.0.html#spec-item-9
      // Resulting version has a higher precedence than the existing published release as defined by Semantic Versioning 2.0.0: http://semver.org/spec/v2.0.0.html#spec-item-11
      // Resulting version will always have an incremented patch version and will never have an incremented minor or major version
      //   - As such, resulting version MAY NOT adhere to the definition of a patch version as defined by Semantic Versioning 2.0.0: http://semver.org/spec/v2.0.0.html#spec-item-6
      //   - Developer should exercise good judgement when determining the proper version for a new release and should not rely on the resulting version as a guide
      var newVersion = `${semver.inc(package.version, 'patch')}-${tag}.${buildNumber}`;
      package.version = newVersion;
    }

    fs.writeFile('package.json', JSON.stringify(package, null, 2), 'utf8', function(err) {
      if (err) {
        throw err;
      }

      console.log('Updated version in package.json to:', package.version);
    });
  };

  this.description = `
                      Update the version in package.json to be a pre-release of the next patch version identified by the provided tag.
                      ${chalk.bold('NOTE:')} This will override the version in your package.json file. Do NOT commit this change to your repo.

                      ${chalk.bold('  buildNumber')}: the buildNumber to uniquely identify the version of this snapshot.
                      ${chalk.bold('  tag')}: the tag name to identify the snapshot of this module in npm.

                      ${chalk.bold('  EXAMPLE:')} If the current version of the project is 1.2.3, and you execute the command "testable-artifact-builder snapshotProject alpha 3", then the resulting version will be 1.2.4-alpha.3
                      `
                      .replace(/^ */gm, '  ')
}

module.exports = new snapshotProject();

