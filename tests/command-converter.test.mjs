import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import shell from 'shell-quote';
import { convert, inputLimit } from '../src/client/features/convert/converter.js';

const toCompose = command => convert(command, 'run-to-compose');
const toRun = document => convert(document, 'compose-to-run');
const service = output => Object.values(parse(output).services)[0];
test('run to Compose retains ports, environment, restart policy and argument boundaries', () => {
  const result = toCompose('docker run -d --name nginx -p 8080:80 -e "GREETING=hello world" --restart unless-stopped nginx sh -c "echo hello  world"');
  const doc = parse(result.output), web = service(result.output);
  assert.equal(doc.name, undefined);
  assert.equal(web.container_name, 'nginx'); assert.equal(web.image, 'nginx');
  assert.deepEqual(web.ports, ['8080:80']); assert.deepEqual(web.environment, ['GREETING=hello world']);
  assert.equal(web.restart, 'unless-stopped'); assert.deepEqual(web.command, ['sh', '-c', 'echo hello  world']);
  assert.ok(result.warnings.includes('lifecycle'));
});
test('run supports container run and backslash continuations, and retains literal dollar signs', () => {
  const result = toCompose("docker container run \\\n -e 'VALUE=$HOME' nginx");
  assert.deepEqual(service(result.output).environment, ['VALUE=$$HOME']);
  assert.ok(result.warnings.includes('variablesRun'));
});
test('Compose to run retains service fields, command arrays, and entrypoint arguments', () => {
  const result = toRun('services:\n  web:\n    image: nginx:alpine\n    ports: ["8080:80"]\n    environment: {GREETING: "hello world"}\n    entrypoint: [sh, -c]\n    command: ["echo hello world"]\n  cache:\n    image: redis:7-alpine\n');
  const commands = result.output.split('\n\n').map(command => shell.parse(command));
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0], ['docker', 'run', '-d', '-p', '8080:80', '-e', 'GREETING=hello world', '--entrypoint', 'sh', 'nginx:alpine', '-c', 'echo hello world']);
  assert.deepEqual(commands[1], ['docker', 'run', '-d', 'redis:7-alpine']);
});
test('generated shell arguments do not expand literal dollar signs or execute injected commands', () => {
  const result = toRun('services:\n  web:\n    image: nginx\n    environment: {MESSAGE: "$$HOME; $$(echo boom)"}\n');
  const tokens = shell.parse(result.output, () => { throw Error('must not expand variables'); });
  assert.ok(tokens.includes('MESSAGE=$HOME; $(echo boom)'));
  assert.ok(tokens.every(token => typeof token === 'string'));
});
test('unsupported run options and orchestration have visible warnings', () => {
  assert.ok(toCompose('docker run --unknown value nginx').warnings.includes('options'));
  const result = toRun('services:\n  web:\n    image: nginx\n    depends_on: [db]\n  db:\n    image: redis\n');
  assert.ok(result.warnings.includes('orchestration'));
});
test('invalid and ambiguous inputs fail instead of returning empty commands', () => {
  for (const [input, expected] of [['', 'empty'], ['docker run', 'image'], ['docker pull nginx', 'run'], ['docker run nginx; echo bad', 'shell'], ['docker run nginx | cat', 'shell'], ['docker run nginx echo "oops', 'shell'], ['docker run nginx\ndocker run redis', 'run'], ['x'.repeat(inputLimit + 1), 'size']]) assert.throws(() => toCompose(input), new RegExp(expected));
  for (const input of ['services: {}', 'services: []', 'hello', 'services:\n  web:\n    build: .', 'services:\n  web:\n    image: ${IMAGE}', 'services:\n  web:\n    image: nginx\n    environment: {FOO: $VALUE}']) assert.throws(() => toRun(input));
});
test('core container configuration survives a conversion round-trip', () => {
  const first = toCompose('docker run --name web -p 8080:80 -e TZ=Asia/Shanghai --restart always nginx:alpine');
  const second = toCompose(toRun(first.output).output);
  assert.deepEqual(service(second.output), service(first.output));
});

test('literal quotes and spaces in options are not lost by the upstream parser', () => {
  const result = toCompose(`docker run -e "FOO=don't" --mount "type=bind,source=/tmp/my folder,target=/data" nginx`);
  const web = service(result.output);
  assert.deepEqual(web.environment, ["FOO=don't"]);
  assert.equal(web.volumes[0].source, '/tmp/my folder');
});

test('Compose option values with both kinds of quotes and dollar commands are literal arguments', () => {
  const result = toRun(`services:
  web:
    image: nginx
    environment:
      MESSAGE: 'say "hello" and don''t expand $$(date)'
    command: [echo, "$$HOME"]
`);
  const tokens = shell.parse(result.output, () => { throw Error('must not expand'); });
  assert.ok(tokens.includes(`MESSAGE=say "hello" and don't expand $(date)`));
  assert.deepEqual(tokens.slice(-2), ['echo', '$HOME']);
});

test('multiline ignored values remain comments in the generated YAML', () => {
  const result = toCompose("docker run --unknown 'first\nservices: injected' nginx");
  assert.equal(Object.keys(parse(result.output).services).length, 1);
  assert.equal(service(result.output).image, 'nginx');
});
