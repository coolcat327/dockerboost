import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function load(entry) {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'neutral' });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}

for (const entry of ['edge-functions/api/index.ts', 'edge-functions/api/[[path]].ts', 'edge-functions/v2/index.ts', 'edge-functions/v2/[[path]].ts']) {
  test(`${entry} exports the shared application`, async () => {
    const { onRequest, default: handler } = await load(entry);
    assert.equal(handler, onRequest);
    const request = path => onRequest({ request: new Request(`https://edge.example${path}`), env: {} });
    assert.equal((await (await request('/api/health')).json()).ok, true);
    for (const path of ['/api', '/api/missing']) {
      const response = await request(path);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: '接口不存在' });
    }
    const rejected = await onRequest({ request: new Request('https://edge.example/api/health', { method: 'HEAD' }), env: {} });
    assert.equal(rejected.status, 405);
    assert.equal(rejected.headers.get('allow'), 'GET');
  });
}

test('EdgeOne preserves environment overrides and streams Registry ranges without buffering', async t => {
  const { onRequest } = await load('src/api/platforms/edgeone.ts');
  const env = { IMAGE_SOURCES: JSON.stringify([{ id: 'custom', label: 'Custom', url: 'https://registry.example', naming: 'native' }]) };
  const catalog = await onRequest({ request: new Request('https://edge.example/api/sources'), env });
  assert.equal((await catalog.json()).sources[0].id, 'custom');
  let streamController;
  const body = new ReadableStream({ start(controller) { streamController = controller; } });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(new URL(url).host, 'registry.example');
    assert.equal(new Headers(init.headers).get('range'), 'bytes=0-3');
    return new Response(body, { status: 206, headers: { 'content-range': 'bytes 0-3/100', 'content-type': 'application/octet-stream' } });
  });
  const digest = 'a'.repeat(64);
  const response = await onRequest({ request: new Request(`https://edge.example/v2/test/blobs/sha256:${digest}?source=custom`, { headers: { range: 'bytes=0-3' } }), env });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-3/100');
  // The handler returned before the upstream produced or completed its body.
  streamController.enqueue(new TextEncoder().encode('data'));
  streamController.close();
  assert.equal(await response.text(), 'data');
});

test('JSON APIs, errors and installation catalog work without static Response.json or AbortSignal.timeout', async t => {
  const { onRequest } = await load('src/api/platforms/edgeone.ts');
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  t.after(() => Object.defineProperty(AbortSignal, 'timeout', timeoutDescriptor));
  const jsonDescriptor = Object.getOwnPropertyDescriptor(Response, 'json');
  Object.defineProperty(Response, 'json', { configurable: true, value: undefined });
  t.after(() => Object.defineProperty(Response, 'json', jsonDescriptor));
  const NativeHeaders = globalThis.Headers;
  const headersDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Headers');
  Object.defineProperty(globalThis, 'Headers', { configurable: true, value: class extends NativeHeaders {
    constructor(...args) {
      if (args.length && args[0] === undefined) {
        throw new TypeError("Parameter 0 type invalid. expect: 'Object' get: 'undefined'");
      }
      super(...args);
    }
  } });
  t.after(() => Object.defineProperty(globalThis, 'Headers', headersDescriptor));
  t.mock.method(globalThis, 'fetch', async url => {
    const address = String(url);
    if (address.includes('download.docker.com')) return new Response('<a href="docker-28.0.1.tgz">Docker</a>');
    if (address.endsWith('/releases/latest')) {
      const response = new Response('');
      Object.defineProperty(response, 'url', { value: 'https://github.com/docker/compose/releases/tag/v2.35.0' });
      return response;
    }
    return new Response('<a href="/docker/compose/releases/download/v2.35.0/docker-compose-linux-aarch64">Compose</a>');
  });
  const request = path => onRequest({ request: new Request(`https://edge.example${path}`), env: {} });
  const catalog = await request('/api/install/catalog?arch=aarch64&version=m4FP7HdW');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get('content-type'), 'application/json');
  assert.equal(catalog.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual(await catalog.json(), { docker: ['28.0.1'], compose: '2.35.0' });
  for (const path of ['/api/health', '/api/sources', '/api/install/plan?arch=aarch64&docker=28.0.1&compose=2.35.0']) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.ok(await response.json());
  }
  const invalid = await request('/api/install/catalog?arch=invalid');
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: '架构无效' });
  assert.equal((await request('/api/missing')).status, 404);
  assert.equal((await request('/api/save')).status, 410);
  const broken = await onRequest({ request: new Request('https://edge.example/api/health'), env: { IMAGE_SOURCES: 'invalid' } });
  assert.equal(broken.status, 500);
  assert.ok((await broken.json()).error);
});
