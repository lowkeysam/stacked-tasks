#!/usr/bin/env node
/**
 * Copy the built plugin into a vault for testing.
 *
 *   npm run install-local -- /path/to/vault
 *   OBSIDIAN_VAULT=/path/to/vault npm run install-local
 */

import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PLUGIN_ID = 'stacked-tasks';
const ARTEFACTS = ['main.js', 'manifest.json', 'styles.css'];

const vault = process.argv[2] ?? process.env.OBSIDIAN_VAULT;

if (!vault) {
  console.error(
    'No vault given. Pass one as an argument or set OBSIDIAN_VAULT.',
  );
  process.exit(1);
}

try {
  await access(path.join(vault, '.obsidian'));
} catch {
  console.error(`${vault} does not look like an Obsidian vault.`);
  process.exit(1);
}

const dest = path.join(vault, '.obsidian', 'plugins', PLUGIN_ID);
await mkdir(dest, { recursive: true });

for (const file of ARTEFACTS) {
  try {
    await copyFile(file, path.join(dest, file));
  } catch (err) {
    console.error(`Could not copy ${file}. Run "npm run build" first.`);
    process.exit(1);
  }
}

console.log(`Installed ${PLUGIN_ID} to ${dest}`);
console.log('Reload Obsidian, or disable and re-enable the plugin.');
