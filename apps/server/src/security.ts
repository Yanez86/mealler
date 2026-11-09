// SPDX-License-Identifier: AGPL-3.0-or-later
// HTTP security headers. The Content-Security-Policy allows only this origin's scripts plus the
// exact inline bootstrap scripts of the built index.html (by hash), so injected scripts cannot run.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(re)) {
    if (!match[1].trim()) continue;
    hashes.push(`'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`);
  }
  return hashes;
}

export function contentSecurityPolicy(publicDir: string): string {
  const index = join(publicDir, 'index.html');
  const hashes = existsSync(index) ? inlineScriptHashes(readFileSync(index, 'utf8')) : [];
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    // Svelte sets dynamic style attributes (bar widths, colours).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

export const PERMISSIONS_POLICY = 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()';
