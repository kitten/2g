#!/usr/bin/env node

(async function main() {
  let cli;
  try {
    cli = await import('../dist/2g-cli.mjs');
  } catch {
    cli = require('../dist/2g-cli.js');
  }

  try {
    process.exitCode = await cli.main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
})();
