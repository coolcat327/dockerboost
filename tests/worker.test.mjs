import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const env = { ASSETS: { fetch: async () => new Response('static page') } };
const request = (path, options) => worker.fetch(new Request(`https://example.com${path}`, options), env);

test('health, static fallback, method guards and retired archive route', async () => {
  assert.equal((await (await request('/api/health')).json()).registry, 'mirror.gcr.io');
  assert.equal(await (await request('/')).text(), 'static page');
  assert.equal((await request('/api/save')).status, 410);
  for (const path of ['/api/health', '/api/sources', '/api/platforms', '/api/inspect', '/api/download-script']) {
    const response = await request(path, { method: 'POST' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
  }
  assert.equal((await request('/api/missing')).status, 404);
  assert.equal((await request('/api/missing')).headers.get('content-type'), 'application/json');
});

test('source list has a short cache', async () => {
  const sources = await request('/api/sources');
  assert.equal(sources.headers.get('cache-control'), 'public, max-age=300, s-maxage=3600');
  const first = (await sources.json()).sources[0];
  assert.equal(first.naming, 'docker-hub');
  assert.equal(first.requiresNamespace, false);
  assert.equal(first.example, 'nginx:latest');
});

test('a configured source controls repository naming and the client source metadata', async (t) => {
  const sourceEnv = { ...env, IMAGE_SOURCES: JSON.stringify([
    { id: 'custom', label: 'Custom', url: 'https://custom.example', naming: 'docker-hub', requiresNamespace: false, example: 'alpine:3' }
  ]) };
  const response = await worker.fetch(new Request('https://example.com/api/sources'), sourceEnv);
  assert.deepEqual((await response.json()).sources, [
    { id: 'custom', label: 'Custom', host: 'custom.example', naming: 'docker-hub', requiresNamespace: false, example: 'alpine:3' }
  ]);
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), 'https://custom.example/v2/library/alpine/manifests/3');
    return Response.json({ schemaVersion: 2, manifests: [] });
  });
  const manifest = await worker.fetch(new Request('https://example.com/api/platforms?image=alpine:3&source=custom'), sourceEnv);
  assert.equal(manifest.status, 200);
});

test('platform response preserves upstream bytes and headers', async (t) => {
  const raw = '{ "schemaVersion": 2, "manifests": [] }';
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(String(url), 'https://mirror.gcr.io/v2/library/nginx/manifests/latest');
    return new Response(raw, { headers: { 'x-upstream': 'retained' } });
  });
  const response = await request('/api/platforms?image=nginx:latest');
  assert.equal(await response.text(), raw);
  assert.equal(response.headers.get('x-upstream'), 'retained');
});

test('single-platform responses include the platform without a second browser request', async (t) => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    paths.push(new URL(url).pathname);
    return paths.length === 1
      ? Response.json({ schemaVersion: 2, config })
      : Response.json({ os: 'linux', architecture: 'arm64', variant: 'v8' });
  });
  const response = await request('/api/platforms?image=nginx:latest');
  assert.deepEqual((await response.json()).platforms, ['linux/arm64/v8']);
  assert.deepEqual(paths, [
    '/v2/library/nginx/manifests/latest',
    `/v2/library/nginx/blobs/${config.digest}`
  ]);
});

test('inspection reports the selected platform compressed image size', async (t) => {
  const amd64Digest = `sha256:${'a'.repeat(64)}`;
  const arm64Digest = `sha256:${'b'.repeat(64)}`;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/manifests/latest')) return Response.json({ schemaVersion: 2, manifests: [
      { digest: amd64Digest, size: 999, platform: { os: 'linux', architecture: 'amd64' } },
      { digest: arm64Digest, size: 999, platform: { os: 'linux', architecture: 'arm64' } }
    ] });
    assert.ok(path.endsWith(`/manifests/${arm64Digest}`));
    return Response.json({ schemaVersion: 2, config: { digest: `sha256:${'c'.repeat(64)}`, size: 40 }, layers: [
      { digest: `sha256:${'d'.repeat(64)}`, size: 100 },
      { digest: `sha256:${'e'.repeat(64)}`, size: 200 }
    ] });
  });
  const response = await request('/api/inspect?image=nginx:latest&platform=linux/arm64&source=mirror-gcr');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sizeBytes, 340);
});

test('blob proxy forwards ranges without buffering the response', async (t) => {
  let source;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.headers.get('range'), 'bytes=0-2');
    source = new Response('abc', { status: 206, headers: { 'content-range': 'bytes 0-2/9' } });
    return source;
  });
  const response = await request('/v2/library/nginx/blobs/sha256:abc', { headers: { range: 'bytes=0-2' } });
  assert.equal(response.status, 206);
  assert.equal(response.body, source.body);
  assert.equal(response.headers.get('content-range'), 'bytes 0-2/9');
  assert.equal(await response.text(), 'abc');
});

test('download script resolves platforms without fetching layers', async (t) => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  const layer = { digest: `sha256:${'b'.repeat(64)}`, size: 3 };
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    paths.push(new URL(url).pathname);
    if (paths.length === 1) return Response.json({ manifests: [{ digest: 'sha256:selected', platform: { os: 'linux', architecture: 'arm64', variant: 'v8' } }] });
    return Response.json({ schemaVersion: 2, config, layers: [layer] });
  });
  const response = await request('/api/download-script?image=nginx:latest&platform=linux/arm64/v8');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /nginx_latest_linux_arm64_v8.tar/);
  assert.equal(paths.length, 2);
  assert.ok(paths.every(path => path.includes('/manifests/')));
});

test('download script omits Docker Hub library namespace from archive filenames', async (t) => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  const layer = { digest: `sha256:${'b'.repeat(64)}`, size: 3 };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ schemaVersion: 2, config, layers: [layer] }));
  const response = await request('/api/download-script?image=library/postgres:18&platform=linux/arm64/v8');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /postgres_18_linux_arm64_v8.tar/);
});

test('automatic source selection returns the first successful configured source', async (t) => {
  const sourceEnv = {
    ...env,
    IMAGE_SOURCES: JSON.stringify([
      { id: 'slow-miss', label: 'Slow miss', url: 'https://miss.example' },
      { id: 'fast-hit', label: 'Fast hit', url: 'https://hit.example' }
    ])
  };
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).hostname === 'miss.example') return new Response('missing', { status: 404 });
    return new Response('{"schemaVersion":2,"manifests":[]}', { headers: { 'content-type': 'application/json' } });
  });
  const response = await worker.fetch(new Request('https://example.com/api/platforms?image=nginx:latest&source=auto'), sourceEnv);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-dockerboost-source'), 'fast-hit');
});

test('automatic source selection uses native repository paths outside Docker Hub mirrors', async (t) => {
  const sourceEnv = {
    ...env,
    IMAGE_SOURCES: JSON.stringify([
      { id: 'mirror-gcr', label: 'Mirror', url: 'https://mirror.example' },
      { id: 'k8s', label: 'Kubernetes', url: 'https://k8s.example' }
    ])
  };
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    paths.push(`${parsed.hostname}${parsed.pathname}`);
    return parsed.hostname === 'k8s.example' && parsed.pathname === '/v2/kube-proxy/manifests/v1.28.4'
      ? Response.json({ schemaVersion: 2, manifests: [] })
      : new Response('missing', { status: 404 });
  });
  const response = await worker.fetch(new Request('https://example.com/api/platforms?image=kube-proxy:v1.28.4&source=auto'), sourceEnv);
  assert.equal(response.status, 200, await response.text());
  assert.deepEqual(paths, [
    'mirror.example/v2/library/kube-proxy/manifests/v1.28.4',
    'k8s.example/v2/kube-proxy/manifests/v1.28.4'
  ]);
});

test('reserved source paths select the upstream without stealing ordinary namespaces', async (t) => {
  const sourceEnv = { ...env, IMAGE_SOURCES: JSON.stringify([{ id: 'hub', label: 'Hub', url: 'https://upstream.example' }]) };
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    paths.push(String(url));
    return new Response('manifest');
  });
  const response = await worker.fetch(new Request('https://example.com/v2/dkbst/hub/library/nginx/manifests/latest'), sourceEnv);
  assert.equal(await response.text(), 'manifest');
  await worker.fetch(new Request('https://example.com/v2/hub/team/app/manifests/latest?source=hub'), sourceEnv);
  assert.deepEqual(paths, [
    'https://upstream.example/v2/library/nginx/manifests/latest',
    'https://upstream.example/v2/hub/team/app/manifests/latest'
  ]);
  assert.equal((await worker.fetch(new Request('https://example.com/v2/dkbst/hub/team/app/manifests/latest?source=other'), sourceEnv)).status, 400);
});

test('auto source uses the same native repository for platforms, inspection, and script blobs', async (t) => {
  const sourceEnv = { ...env, IMAGE_SOURCES: JSON.stringify([
    { id: 'mirror-gcr', label: 'Mirror', url: 'https://mirror.example' },
    { id: 'k8s', label: 'K8S', url: 'https://k8s.example' }
  ]) };
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  const layer = { digest: `sha256:${'b'.repeat(64)}`, size: 3 };
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const parsed = new URL(url);
    paths.push(`${parsed.hostname}${parsed.pathname}`);
    if (parsed.hostname !== 'k8s.example' || parsed.pathname.includes('/library/')) return new Response('missing', { status: 404 });
    if (parsed.pathname.endsWith('/manifests/v1')) return Response.json({ schemaVersion: 2, config, layers: [layer] });
    if (parsed.pathname.endsWith(`/blobs/${config.digest}`)) return Response.json({ os: 'linux', architecture: 'amd64' });
    return new Response('missing', { status: 404 });
  });
  const base = 'https://example.com';
  const query = 'image=kube-proxy:v1&source=auto';
  const platforms = await worker.fetch(new Request(`${base}/api/platforms?${query}`), sourceEnv);
  assert.equal(platforms.status, 200);
  assert.deepEqual((await platforms.json()).platforms, ['linux/amd64']);
  const inspection = await worker.fetch(new Request(`${base}/api/inspect?${query}`), sourceEnv);
  assert.equal(inspection.status, 200);
  assert.equal((await inspection.json()).source, 'k8s');
  const script = await worker.fetch(new Request(`${base}/api/download-script?${query}`), sourceEnv);
  assert.equal(script.status, 200);
  assert.match(await script.text(), /\/v2\/kube-proxy\/blobs\/sha256:/);
  assert.ok(paths.some((path) => path === 'k8s.example/v2/kube-proxy/manifests/v1'));
  assert.ok(!paths.some((path) => path === 'k8s.example/v2/library/kube-proxy/manifests/v1'));
});

test('qualified registry references pin their source and preserve the native repository', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    paths.push(String(url));
    return Response.json({ schemaVersion: 2, manifests: [] });
  });
  const response = await request('/api/platforms?image=ghcr.io%2Fteam%2Fapp%3A1&source=auto');
  assert.equal(response.status, 200);
  assert.deepEqual(paths, ['https://ghcr.io/v2/team/app/manifests/1']);
  const hub = await request('/api/platforms?image=docker.io%2Fnginx%3Alatest&source=auto');
  assert.equal(hub.status, 200);
  assert.equal(paths.at(-1), 'https://mirror.gcr.io/v2/library/nginx/manifests/latest');
  assert.equal((await request('/api/platforms?image=ghcr.io%2Fteam%2Fapp%3A1&source=k8s')).status, 400);
  assert.equal((await request('/api/platforms?image=docker.io%2Fnginx%3Alatest&source=k8s')).status, 400);
  assert.equal((await request('/api/platforms?image=unknown.example%2Fteam%2Fapp%3A1')).status, 400);
});

test('API errors retain distinct client, missing, and upstream statuses', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('missing', { status: 404 }));
  assert.equal((await request('/api/inspect?image=nginx:latest&source=mirror-gcr')).status, 404);
  const missingPlatform = await request('/api/platforms?image=nginx:latest&source=mirror-gcr');
  assert.equal(missingPlatform.status, 404);
  assert.match((await missingPlatform.json()).error, /404/);
  assert.equal((await request('/api/inspect?image=%21')).status, 400);
  assert.equal((await request('/api/inspect?image=..%2Fadmin')).status, 400);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.equal((await request('/api/inspect?image=nginx:latest&source=mirror-gcr')).status, 502);
});
