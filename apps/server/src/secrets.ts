// SPDX-License-Identifier: AGPL-3.0-or-later
// Encryption at rest for secrets stored in the database (e.g. the Anthropic API key).
// The key comes from MEALLER_SECRET_KEY or, if unset, from a file generated once in the data folder.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(sealed: string): string;
}

export function loadSecretKey(dataDir: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  const fromEnv = env.MEALLER_SECRET_KEY?.trim();
  if (fromEnv) return createHash('sha256').update(fromEnv).digest();
  const file = join(dataDir, 'secret.key');
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'), { mode: 0o600 });
  return createHash('sha256').update(readFileSync(file, 'utf8').trim()).digest();
}

export function createSecretBox(key: Buffer): SecretBox {
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
    },
    decrypt(sealed) {
      const [version, iv, tag, data] = sealed.split(':');
      if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported secret format');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    }
  };
}
