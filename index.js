#!/usr/bin/env node

const snapshotProject = require('./lib/snapshotProject');
const installSnapshots = require('./lib/installSnapshots');

let program = require('commander');

program
  .version(require('./package').version);

program
  .command('installSnapshots <dependenciesPath> <tag>')
  .description(installSnapshots.description)
  .action(installSnapshots.action);

program
  .command('snapshotProject <buildNumber> [tag]')
  .option('--prerelease', 'Generate a snapshot as a prerelease version\n              This requires that a [tag] argument be set\n              This is the default option')
  .option('--patch', 'Generate a snapshot as a patch version')
  .description(snapshotProject.description)
  .action(snapshotProject.action);


program.parse(process.argv);
