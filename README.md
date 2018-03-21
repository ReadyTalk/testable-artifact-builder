[![Build Status](https://travis-ci.org/ReadyTalk/testable-artifact-builder.svg?branch=master)](https://travis-ci.org/ReadyTalk/testable-artifact-builder)

# testable-artifact-builder

This module is intended to help teams build testable artifacts based on feature branch work of Node.js projects that have complex dependency trees of in-house modules.

## What does that mean?

Imagine you are building an app with the following dependency chain:

![Alt text](https://i.imgur.com/tpfCpoz.png?1 "Cat in the Hat Dependency Tree")

- Cat in the Hat depends on Thing 1 and Thing 2
- Thing 1 depends on Fish
- Thing 2 depends on Fish
- Cat in the Hat, Thing 1, Thing 2, and Fish are all repos being developed at your company, possibly by different teams

So how do you test a project like this? It's simple enough to test changes to any one of these dependencies in isolation, but you'll eventually need to build an artifact of the full Cat in the Hat project to integration test the system together. When it comes time to do that you may choose to merge all changes into the master branch and build testable artifacts from there. That will probably work for a single small team, but testing can get pretty hairy when you have multiple teams implementing features that require changes in multiple repos. Consider the case where:

- Team A needs to change Cat in the Hat and Thing 1
- Team B needs to change Thing 1 and Fish
- Team C needs to change Cat in the Hat, Thing 2, and Fish

If all of those feature branches get merged into their respective master branches at once and a bug is found when integration testing the resulting artifact, you'll lose a ton of time just trying to track down which team introduced the issue. Instead of testing everything at once on the master branch you should consider building testable artifacts based on the feature branches _before_ they are merged together. This module makes it easy to do so using your favorite continuous integration tool. `testable-artifact-builder` provides a CLI with two scripts that can be incorporated into your build pipeline:

## The `snapshotProject` Script

### Description

    $ testable-artifact-builder snapshotProject --help

    Usage: snapshotProject [options] <buildNumber> [tag]


    Update the version in package.json to be a pre-release of the next patch version identified by the provided tag.
    NOTE: This will override the version in your package.json file. Do NOT commit this change to your repo.

      buildNumber: the buildNumber to uniquely identify the version of this snapshot.
      tag: the tag name to identify the snapshot of this module in npm.

      EXAMPLE: If the current version of the project is 1.2.3, and you execute the command "testable-artifact-builder snapshotProject alpha 3", then the resulting version will be 1.2.4-alpha.3



    Options:

      --prerelease  Generate a snapshot as a prerelease version
                    This requires that a [tag] argument be set
                    This is the default option
      --patch       Generate a snapshot as a patch version
      -h, --help    output usage information

### Usage

Within the build / deploy pipeline of each dependency, you should identify whether you are deploying a new release version or a snapshot version for testing. If it's the latter, then you should add a step to the deploy stage of your pipeline that will execute this script before deploying. You'll additionally want to add a stage that triggers the build pipeline of the top-level dependency. Continuing with our example from before, the Jenkinsfile for the Fish repo would look something like this:

    node () {
      stage('Prepare Environment') { ... }

      stage('Install Dependencies') { ... }

      stage('Build Fish') { ... }

      stage('Publish to NPM') {
        if (env.BRANCH_NAME == 'master' && PUBLISHING_NEW_RELEASE) {
          sh 'npm publish'
        } else {
          sh "./node_modules/.bin/testable-artifact-builder snapshotProject ${env.BUILD_NUMBER} ${params.TAG}"
          sh "npm publish --tag ${env.BRANCH_NAME}"
        }
      }

      stage('Trigger Cat in the Hat job') {
        build job: 'cat_in_the_hat/master', parameters: [[$class: 'StringParameterValue', name: 'TAG', value: env.BRANCH_NAME]], wait: false
      }
    }

As you can see from the example, using the branch name as the `tag` and the Jenkins build number as the `buildNumber` is a good way to uniquely identify versions to be bundled into the testable artifact across repos. Also note that you _must_ pass the `--tag` option to `npm publish` using the same string you passed as the tag to `snapshotProject`.

### Notes About the Resulting Version

#### Using the `prerelease` option

- This option is used by default or when the `--prerelease` option is set
- The resulting version syntax adheres to [the pre-release syntax](http://semver.org/spec/v2.0.0.html#spec-item-9) as defined by Semantic Versioning 2.0.0
- The resulting version has [a higher precedence](http://semver.org/spec/v2.0.0.html#spec-item-11) than the existing published release as defined by Semantic Versioning 2.0.0
- The resulting version will always have an incremented patch version and will never have an incremented minor or major version
    - As such, the resulting version MAY NOT adhere to [the definition of a patch version](http://semver.org/spec/v2.0.0.html#spec-item-6) as defined by Semantic Versioning 2.0.0
    - The developer should exercise good judgement when determining the proper version for a new release and should not rely on the resulting version as a guide

#### Using the `patch` option

- This option is used when the `--patch` option is set
- The resulting version syntax adheres to [the patch syntax](https://semver.org/spec/v2.0.0.html#spec-item-6) as defined by Semantic Versioning 2.0.0
- The resulting version MAY OR MAY NOT have [a higher precedence](http://semver.org/spec/v2.0.0.html#spec-item-11) than the existing published release as defined by Semantic Versioning 2.0.0
- The resulting version MAY have an incremented patch version but WILL NEVER have an incremented minor or major version
    - As such, resulting version MAY NOT adhere to [the definition of a patch version](http://semver.org/spec/v2.0.0.html#spec-item-6) as defined by Semantic Versioning 2.0.0
    - Developer should exercise good judgement when determining the proper version for a new release and should not rely on the resulting version as a guide

## The `installSnapshots` Script

### Description

    $ testable-artifact-builder installSnapshots --help

    Usage: installSnapshots [options] <dependenciesPath> <tag>


    Install snapshot version of all dependencies in the <dependenciesPath> file that have been published with <tag>.
    NOTE: This will override your package.json to prevent version errors. Do NOT commit this change to your repo.

      dependenciesPath: a path to a JSON file containing all dependencies to install.
      tag: the tag name used when publishing a snapshots of the dependencies to npm.




      Options:

        -h, --help  output usage information

### Usage

`installSnapshots` is used in the top-level dependency to bundle together all dependencies that have been tagged for your feature. To work properly, you _must_ install `testable-artifact-builder` first inside the pipeline for your top-level dependency and use `installSnapshots` to install dependencies rather than installing directly via npm. This is due to how `testable-artifact-builder` handles transitive dependencies that have also been updated as part of the feature work. The pipeline should be parameterized to receive a `tag` argument that will be passed to `installSnapshots`.

As with the dependency pipelines, you should identify whether you are deploying a new release version or a snapshot version for testing. If it's the latter, then you should add a step to the deploy stage of your pipeline that will execute `snapshotProject` before deploying. Continuing with our example from before, the Jenkinsfile for the Cat in the Hat repo would look something like this:

    properties([
      parameters([
        string(name: 'TAG', defaultValue: '', description: 'The tag name to use when installing dependencies for a test artifact')
      ])
    ])

    node () {
      stage('Prepare Environment') { ... }

      stage('Install Dependencies') {
        if (params.TAG != '') {
          sh 'npm install @local/testable-artifact-builder'
          sh "./node_modules/.bin/testable-artifact-builder installSnapshots testDependencies.json ${params.TAG}"
        } else {
          sh 'npm install'
        }
      }

      stage('Build Cat in the Hat') { ... }

      stage('Publish to NPM') {
        if (env.BRANCH_NAME == 'master' && PUBLISHING_NEW_RELEASE) {
          sh "npm publish"
        } else if (params.TAG != '') {
          sh "./node_modules/.bin/testable-artifact-builder snapshotProject ${params.TAG} ${env.BUILD_NUMBER}"
          sh "npm publish --tag ${params.TAG}"
        }
      }
    }

You will also need to provide a json file containing an array of all dependencies that should be checked for tagged version. This can be the exhaustive list for the project; it does not need to be updated for each feature branch. Continuing with our example from before, the testDependencies.json file for the Cat in the Hat repo would look something like this:

    [
      "thing_1",
      "thing_2",
      "fish"
    ]

## Handling Slashes in Tags

npm will throw an error that a version is invalid if it contains a slash. For that reason, the `tag` is split using forward slash as the delimiter when it is passed to `snapshotProject`, and only the last substring in the resulting array is used in the version. For instance, if the current version of your module is `1.2.3` and you execute the following command:

    $ testable-artifact-builder snapshotProject --tag bug/expedite/my-ticket --buildNumber 5

then the resulting version will be `1.2.4-my-ticket.5`

npm does not put the same restrictions on `dist-tags` though, so the `installSnapshot` script makes no assumptions about slashes. It will search the `dist-tags` of the test dependencies using the exact string that is passed as the `tag`. Therefore, it is important to ensure that you publish to npm using the correct `dist-tag`, even if it does not match the version name of your module.

## Example Using Travis CI

`testable-artifact-builder` uses its own scripts to build and publish snapshots of itself via Travis CI. You can use the [.travis.yml](https://github.com/ReadyTalk/testable-artifact-builder/blob/master/.travis.yml) file in this repo as an example for your own build.

## Publishing a New Release

To publish a new release version of `testable-artifact-builder`, follow these steps:

1. Run `git checkout master` to ensure you are on the master branch.
2. Run `npm version [major | minor | patch]` to correctly increment the version.
3. Run `git push --follow-tags` to commit the updated package.json file and new tag.

Travis CI will identify that a new build was triggered by a Git Tag and publish a new release version as a result.
