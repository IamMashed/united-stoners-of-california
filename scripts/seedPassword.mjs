// Password of the dev demo accounts (kushking, hashqueen). Never committed: read from
// USOC_SEED_PASSWORD or the macOS Keychain (service usoc-dev-seed). The first call on a
// machine without one generates a random password and stores it in the Keychain.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const SERVICE = 'usoc-dev-seed';
const ACCOUNT = 'password';

export function seedPassword({ create = false } = {}) {
  if (process.env.USOC_SEED_PASSWORD) return process.env.USOC_SEED_PASSWORD.trim();
  try {
    return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', ACCOUNT, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  }
  catch {
    if (!create) {
      throw new Error(`No dev seed password. Set USOC_SEED_PASSWORD or add it to the Keychain (service ${SERVICE}).`);
    }
  }
  const generated = randomBytes(18).toString('base64url');
  execFileSync('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', ACCOUNT, '-w', generated]);
  return generated;
}
