import composerize from 'composerize';
import decomposerize from 'decomposerize';
import { parse, stringify } from 'yaml';
import shell from 'shell-quote';

export const inputLimit = 64 * 1024;
const mapping = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = code => { throw new Error(code); };
const tokenize = input => {
  // shell-quote accepts unterminated quotes; reject them before parsing.
  let quote = '', escaped = false;
  for (const character of input) {
    if (escaped) { escaped = false; continue; }
    if (character === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (character === quote) quote = ''; }
    else if (character === "'" || character === '"') quote = character;
  }
  if (quote || escaped) fail('shell');
  const tokens = shell.parse(input, key => `$${key}`);
  if (tokens.some(token => typeof token !== 'string')) fail('shell');
  return tokens;
};
const quoteTokens = tokens => tokens.map(token => /^[A-Za-z0-9_./:@%+=,-]+$/.test(token) ? token : `'${token.replaceAll("'", "'\\''")}'`).join(' ');
const commandArgs = command => Array.isArray(command) ? command.map(String) : command ? tokenize(String(command)) : [];

// Protect literal characters from the upstream libraries' lossy shell quoting.
// Separators (=, :, ,) stay intact for environment, mounts, and port mappings.
function literalCodec(input) {
  let marker = 'DockerBoostLiteral';
  while (input.includes(marker)) marker += 'X';
  const literals = [];
  const map = (value, transform) => typeof value === 'string' ? transform(value) : Array.isArray(value) ? value.map(item => map(item, transform)) : mapping(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [transform(key), map(item, transform)])) : value;
  return {
    encode: value => map(value, text => text.replace(/[^A-Za-z0-9_./:@%+=,-]/g, character => {
      const replacement = `${marker}${literals.length}End`;
      literals.push(character); return replacement;
    })),
    decode: value => map(value, text => text.replace(new RegExp(`${marker}(\\d+)End`, 'g'), (_, index) => literals[Number(index)]))
  };
}

// Keep generated services easy to scan while retaining unfamiliar fields and their order.
const serviceFieldOrder = [
  'image', 'container_name', 'hostname', 'restart', 'init', 'user', 'working_dir',
  'entrypoint', 'command', 'environment', 'env_file', 'ports', 'expose',
  'volumes', 'network_mode', 'networks', 'depends_on', 'healthcheck',
  'labels', 'logging', 'deploy'
];
const orderServiceFields = service => {
  const ordered = {};
  for (const key of serviceFieldOrder) if (Object.hasOwn(service, key)) ordered[key] = service[key];
  for (const [key, value] of Object.entries(service)) if (!Object.hasOwn(ordered, key)) ordered[key] = value;
  return ordered;
};

export function convert(input, direction) {
  if (!input.trim()) fail('empty');
  if (new TextEncoder().encode(input).length > inputLimit) fail('size');
  const warnings = [];
  if (direction === 'run-to-compose') {
    const source = input.trim().replace(/\\\r?\n/g, ' ');
    const tokens = tokenize(source);
    const prefix = tokens[0] === 'docker' && (tokens[1] === 'run' ? 2 : tokens[1] === 'container' && tokens[2] === 'run' ? 3 : 0);
    if (!prefix || /\n\s*(?:docker|sudo)\s/.test(source)) fail('run');
    const codec = literalCodec(input);
    const converted = composerize(codec.encode(tokens).join(' '), null, 'latest', 2);
    const parsed = parse(converted);
    const doc = codec.decode(parsed);
    const service = Object.values(doc?.services || {})[0];
    if (!service?.image || service.image === '!!!invalid!!!') fail('image');
    // Preserve the shell argument boundaries that the upstream string command loses.
    const imageIndex = tokens.length - commandArgs(Object.values(parsed.services)[0].command).length - 1;
    if (imageIndex < prefix || tokens[imageIndex] !== service.image) fail('image');
    if (tokens.length > imageIndex + 1) service.command = tokens.slice(imageIndex + 1);
    if (service.command) warnings.push('command');
    const escapeDollars = value => typeof value === 'string' ? value.replaceAll('$', () => '$$') : Array.isArray(value) ? value.map(escapeDollars) : mapping(value) ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeDollars(item)])) : value;
    if (input.includes('$')) warnings.push('variablesRun');
    if (tokens.includes('--network') && service.network_mode === 'host') warnings.push('host');
    delete doc.name; // Upstream inserts a placeholder that is not a valid project name.
    for (const [name, value] of Object.entries(doc.services)) doc.services[name] = orderServiceFields(value);
    const notes = codec.decode(converted.split('\n').filter(line => line.startsWith('#')))
      .flatMap(line => line.split(/\r?\n/).map(part => part.startsWith('#') ? part : `# ${part}`));
    if (notes.length) warnings.push('options');
    if (doc.volumes || doc.networks) warnings.push('external');
    if (tokens.includes('--rm') || tokens.includes('-d') || tokens.includes('--detach')) warnings.push('lifecycle');
    return { output: `${notes.join('\n')}${notes.length ? '\n' : ''}${stringify(escapeDollars(doc))}`, warnings };
  }
  if (direction !== 'compose-to-run') fail('direction');
  const doc = parse(input, { maxAliasCount: 50 });
  if (!mapping(doc) || !mapping(doc.services) || !Object.keys(doc.services).length) fail('compose');
  if (Object.keys(doc.services).length > 100) fail('services');
  if (/\$(?:\{|[A-Za-z_])/.test(input.replaceAll('$$', ''))) fail('variables');
  const output = [];
  for (const [name, service] of Object.entries(doc.services)) {
    if (!mapping(service) || typeof service.image !== 'string' || !service.image.trim()) fail('image');
    if (service.build || service.depends_on || service.profiles || service.extends || service.develop || service.secrets || service.configs || service.deploy) warnings.push('orchestration');
    const { command, entrypoint, ...configuration } = service;
    const codec = literalCodec(input);
    const raw = decomposerize(stringify({ services: { [name]: codec.encode(configuration) } }), { detach: true, multiline: false });
    const tokens = codec.decode(tokenize(raw)).map(token => token.replaceAll('$$', '$'));
    // Generate literal shell arguments: upstream double quotes permit shell expansion.
    if (tokens.at(-1) !== service.image) fail('result');
    tokens.pop();
    const unescape = value => Array.isArray(value) ? value.map(item => String(item).replaceAll('$$', '$')) : typeof value === 'string' ? value.replaceAll('$$', '$') : value;
    const entry = commandArgs(unescape(entrypoint));
    if (entry.length) tokens.push('--entrypoint', entry[0]);
    else if (entrypoint !== undefined && entrypoint !== null) tokens.push('--entrypoint', '');
    tokens.push(service.image, ...entry.slice(1), ...commandArgs(unescape(command)));
    output.push(quoteTokens(tokens));
  }
  if (doc.networks || doc.volumes || doc.name) warnings.push('external');
  warnings.push('review');
  return { output: output.join('\n\n'), warnings: [...new Set(warnings)] };
}
