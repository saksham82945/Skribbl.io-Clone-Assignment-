import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverCopy = path.resolve(here, '../src/shared/types.ts');
const clientCopy = path.resolve(here, '../../client/src/shared/types.ts');

describe('shared types', () => {
  // The client and server each keep a copy so they can be deployed separately.
  it.skipIf(!existsSync(clientCopy))('client and server copies are identical', () => {
    expect(readFileSync(clientCopy, 'utf8')).toBe(readFileSync(serverCopy, 'utf8'));
  });
});
