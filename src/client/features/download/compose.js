import { parseDocument } from 'yaml';

export function composeImages(text) {
  if (text.length > 1024 * 1024) throw new Error('Compose exceeds 1 MiB');
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const value = doc.toJS({ maxAliasCount: 100 });
  if (!value || typeof value !== 'object' || !value.services || typeof value.services !== 'object' || Array.isArray(value.services)) throw new Error('Compose services must be a mapping');
  if (value.include) throw new Error('include is not supported; use docker compose config first');
  const images = new Map(), issues = [];
  for (const [service, definition] of Object.entries(value.services)) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) { issues.push(`${service}: invalid service`); continue; }
    if (definition.extends) { issues.push(`${service}: extends requires docker compose config`); continue; }
    const { image, platform = '' } = definition;
    if (typeof image !== 'string' || !image.trim()) { issues.push(`${service}: missing image (build is not executed)`); continue; }
    if (typeof platform !== 'string' || image.includes('$') || platform.includes('$')) { issues.push(`${service}: unresolved variable or invalid platform`); continue; }
    if (!/^[a-zA-Z0-9._/@:-]+$/.test(image) || (platform && !/^[-\w]+\/[-\w]+(?:\/[-\w]+)?$/.test(platform))) { issues.push(`${service}: invalid image or platform`); continue; }
    const key = `${image}\n${platform}`;
    if (!images.has(key)) images.set(key, { image, platform, services: [] });
    images.get(key).services.push(service);
  }
  return { images: [...images.values()], issues };
}

export function batchScript(entries, origin) {
  const unique = [...new Map(entries.map(entry => [JSON.stringify([entry.image, entry.platform, entry.source]), entry])).values()];
  const commands = unique.map(({ image, platform, source = 'auto' }, index) => {
    const url = new URL('/api/download-script', origin);
    url.search = new URLSearchParams({ image, platform, source }).toString();
    return `curl -fsSL '${url.href}' -o "$tmp/${index}.sh"\nsh "$tmp/${index}.sh"`;
  });
  return ['#!/bin/sh', 'set -eu', 'tmp=$(mktemp -d)', `trap 'rm -rf "$tmp"' EXIT HUP INT TERM`, ...commands, ''].join('\n');
}

// Match the single-image terminal workflow; && prevents later commands after failure.
export function batchCommands(entries, origin) {
  const unique = [...new Map(entries.map(entry => [JSON.stringify([entry.image, entry.platform, entry.source]), entry])).values()];
  return unique.map(({ image, platform, source = 'auto' }, index) => {
    const url = new URL('/api/download-script', origin);
    url.search = new URLSearchParams({ image, platform, source }).toString();
    const file = `.download-image-${index + 1}.sh`;
    return `curl -fsSL -o ${file} "${url.href}" && sh ${file}`;
  }).join(' &&\n');
}
