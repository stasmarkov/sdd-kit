#!/usr/bin/env node
/**
 * Node version guard for the gate planner.
 *
 * trust-store.mjs is an ES module that needs Node 18 or later. Run by an older node it fails with a
 * syntax error, which the gate skills could only report as a broken install. This launcher is parsed
 * by any node from version 8 on, so it checks the version first and names the real cause.
 *
 * Usage:
 *   launch.cjs <trust-store.mjs arguments>   for example: launch.cjs plan --repo . --key drupal
 *
 * Exit codes: 3 when the node running it is older than 18 (trust-store.mjs uses 0, 1 and 2);
 * otherwise the exit status of trust-store.mjs, run with the same arguments by the same node.
 *
 * Keep this file to syntax Node 8 parses: no import or export, no optional chaining (?.), no
 * nullish coalescing (??) and no optional catch binding.
 */

'use strict';

const path = require('path');
const childProcess = require('child_process');

const MIN_MAJOR = 18;
const GUARD_EXIT = 3;

/**
 * The guard message for a node version, or null when that version can run the planner.
 * @param {string} version a version string as process.version prints it, for example "v11.15.0"
 * @returns {string|null} "not run (Node 18+ required, found v11.15.0). Fix: put Node 18+ first on PATH",
 *   or null at major 18 or later
 * @example nodeGuard('v17.9.1') // 'not run (Node 18+ required, found v17.9.1). Fix: put Node 18+ first on PATH'
 */
function nodeGuard(version) {
  const text = String(version).trim();
  const match = /^v?(\d+)\./.exec(text);
  if (match && Number(match[1]) >= MIN_MAJOR) return null;
  const shown = text.charAt(0) === 'v' ? text : 'v' + text;
  return 'not run (Node ' + MIN_MAJOR + '+ required, found ' + shown + '). Fix: put Node ' + MIN_MAJOR + '+ first on PATH';
}

/**
 * Runs trust-store.mjs beside this file with the given arguments, after the version check.
 * @param {string[]} args the arguments after the script name
 * @returns {number} the exit status
 */
function main(args) {
  const message = nodeGuard(process.version);
  if (message) {
    process.stdout.write(message + '\n');
    return GUARD_EXIT;
  }
  const script = path.join(__dirname, 'trust-store.mjs');
  const result = childProcess.spawnSync(process.execPath, [script].concat(args), { stdio: 'inherit' });
  if (result.error) {
    process.stderr.write('could not run ' + script + ': ' + result.error.message + '. Fix: reinstall sdd-kit\n');
    return 1;
  }
  return result.status === null ? 1 : result.status;
}

module.exports = { nodeGuard };

if (require.main === module) process.exit(main(process.argv.slice(2)));
