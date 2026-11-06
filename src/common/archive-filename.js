import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// Image references and platforms accepted by the application are ASCII.
export function archiveFilename(image, platform) {
  const name = `${image.replace(/^library\//, '')}_${platform}`.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
  if (name.length <= 236) return `${name}.tar`;
  const hash = bytesToHex(sha256(new TextEncoder().encode(`${image}\0${platform}`))).slice(0, 16);
  return `${name.slice(0, 219)}_${hash}.tar`;
}
