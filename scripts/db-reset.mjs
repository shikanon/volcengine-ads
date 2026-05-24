import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const candidates = [
  join(homedir(), 'Library', 'Application Support', 'AIGC Ads Studio', 'aigc.db'),
  join(homedir(), '.config', 'AIGC Ads Studio', 'aigc.db'),
];

await Promise.allSettled(candidates.map((path) => rm(path, { force: true })));
console.log('Local development database reset.');
