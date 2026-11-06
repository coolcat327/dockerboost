/** @param {string} value */
export function splitImageReference(value) {
  if (!value || /[^a-zA-Z0-9._/@:-]/.test(value)) return null;
  const digest = value.indexOf('@');
  const name = digest >= 0 ? value.slice(0, digest) : value;
  const slash = name.lastIndexOf('/');
  const colon = name.lastIndexOf(':');
  const tagged = colon > slash;
  const repository = tagged ? name.slice(0, colon) : name;
  const tag = tagged ? name.slice(colon + 1) : '';
  const reference = digest >= 0 ? value.slice(digest + 1) : tagged ? tag : 'latest';
  if ((tagged && !tag) || !reference || reference.includes('/') || !repository.split('/').every(part => part && part !== '.' && part !== '..')) return null;
  return { repository, reference, digest: digest >= 0, tagged, tag };
}

/** @param {string} value */
export function localImageTag(value) {
  if (!value.includes('@')) return value;
  const parts = splitImageReference(value);
  return parts?.tagged ? value.slice(0, value.indexOf('@')) : null;
}
