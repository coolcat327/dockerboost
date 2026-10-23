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

const shellQuote = value => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";

export function batchCommands(entries, origin) {
  const unique = [...new Map(entries.map(({ image, platform, source = 'auto' }) => [JSON.stringify([image, platform, source]), { image, platform, source }])).values()];
  if (!unique.length) return '';
  const base = new URL(origin).origin;
  const rows = unique.map(({ image, platform, source }) => `  ${[image, platform, source].map(shellQuote).join(' ')}`);
  return `curl -fsSL -o .download-images.sh ${shellQuote(`${base}/download-images.sh`)} && sh .download-images.sh ${shellQuote(base)} \\\n${rows.join(' \\\n')}`;
}
