import { staticAssetUrl } from '../../common/download-cache-policy.js';

const shellQuote = value => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";

export function batchCommands(entries, origin) {
  const unique = [...new Map(entries.map(({ image, platform, source = 'auto' }) => [JSON.stringify([image, platform, source]), { image, platform, source }])).values()];
  if (!unique.length) return '';
  const base = new URL(origin).origin;
  const rows = unique.map(({ image, platform, source }) => `  ${[image, platform, source].map(shellQuote).join(' ')}`);
  return `curl -fsSL -o .download-images.sh ${shellQuote(`${base}${staticAssetUrl('download-images.sh')}`)} && sh .download-images.sh ${shellQuote(base)} \\\n${rows.join(' \\\n')}`;
}
