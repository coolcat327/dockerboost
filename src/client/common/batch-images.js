import { parseDocument } from 'yaml';
import { splitImageReference } from '../../common/image-syntax.js';

const maxInputBytes = 1024 * 1024;

function checkInputSize(text, message) {
  if (text.length > maxInputBytes || new TextEncoder().encode(text).byteLength > maxInputBytes) throw new Error(message);
}

export function composeImages(text) {
  checkInputSize(text, 'Compose exceeds 1 MiB');
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const value = doc.toJS({ maxAliasCount: 100 });
  if (value && typeof value === 'object' && Object.hasOwn(value, 'include')) throw new Error('include is not supported; use docker compose config first');
  if (!value || typeof value !== 'object' || !value.services || typeof value.services !== 'object' || Array.isArray(value.services)) throw new Error('Compose services must be a mapping');
  const images = new Map(), issues = [];
  for (const [service, definition] of Object.entries(value.services)) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) { issues.push(`${service}: invalid service`); continue; }
    if (definition.extends) { issues.push(`${service}: extends requires docker compose config`); continue; }
    const { image, platform = '' } = definition;
    if (typeof image !== 'string' || !image.trim()) { issues.push(`${service}: missing image (build is not executed)`); continue; }
    if (typeof platform !== 'string' || image.includes('$') || platform.includes('$')) { issues.push(`${service}: unresolved variable or invalid platform`); continue; }
    if (!splitImageReference(image) || (platform && !/^[-\w]+\/[-\w]+(?:\/[-\w]+)?$/.test(platform))) { issues.push(`${service}: invalid image or platform`); continue; }
    const key = `${image}\n${platform}`;
    if (!images.has(key)) images.set(key, { image, platform, services: [] });
    images.get(key).services.push(service);
  }
  return { images: [...images.values()], issues };
}

export function imageList(text) {
  checkInputSize(text, 'Input exceeds 1 MiB');
  const images = new Map(), issues = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const image = line.trim();
    if (!image) return;
    if (!splitImageReference(image)) { issues.push(`Line ${index + 1}: invalid image`); return; }
    if (!images.has(image)) images.set(image, { image, platform: '' });
  });
  return { images: [...images.values()], issues };
}

export function parseBatchImages(text) {
  try { return composeImages(text); }
  catch (error) {
    // Do not turn malformed Compose keys into candidate image names.
    if (/^\s*(?:["'](?:services|include)["']|services|include)\s*:(?:\s|$)/m.test(text)) throw error;
    return imageList(text);
  }
}

