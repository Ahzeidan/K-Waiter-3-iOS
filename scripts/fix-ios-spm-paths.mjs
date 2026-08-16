import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
const source = await readFile(file, 'utf8');
const normalized = source
  .split(/\r?\n/)
  .map(line => line.includes('path: "') ? line.replaceAll('\\', '/') : line)
  .join('\n');
if (source !== normalized) await writeFile(file, normalized, 'utf8');
