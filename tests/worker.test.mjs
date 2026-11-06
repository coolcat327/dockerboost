import { config } from '../config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/api/platforms/cloudflare.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
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

test('metadata APIs reject incomplete image references before contacting a registry', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('unexpected request'); });
  for (const image of [':latest', 'nginx:', 'nginx@', 'owner//image', 'owner/../image', 'owner/./image', 'nginx@sha256:abc/extra']) {
    const response = await request(`/api/inspect?source=mirror-gcr&image=${encodeURIComponent(image)}`);
    assert.equal(response.status, 400, image);
  }
  assert.equal(requests, 0);
});

test('tagged digest metadata requests use the repository without the tag', async t => {
  const digest = `sha256:${'a'.repeat(64)}`;
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    paths.push(new URL(url).pathname);
    return Response.json({ schemaVersion: 2, manifests: [] });
  });
  const response = await request(`/api/platforms?source=mirror-gcr&image=${encodeURIComponent(`nginx:stable@${digest}`)}`);
  assert.equal(response.status, 200);
  assert.deepEqual(paths, [`/v2/library/nginx/manifests/${digest}`]);
});

test('terminal plans retain qualified names and tags while resolving digest repository paths', async t => {
  const sourceEnv = { ...env, IMAGE_SOURCES: JSON.stringify([{ id: 'ghcr', label: 'GHCR', url: 'https://ghcr.io', naming: 'native' }]) };
  const digest = `sha256:${'a'.repeat(64)}`;
  const config = { digest: `sha256:${'b'.repeat(64)}`, size: 3 };
  const image = `ghcr.io/owner/image:stable@${digest}`;
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname; paths.push(path);
    return path.includes('/blobs/') ? Response.json({ os: 'linux', architecture: 'amd64' }) : Response.json({ schemaVersion: 2, config, layers: [] });
  });
  const query = `image=${encodeURIComponent(image)}&source=ghcr`;
  const planResponse = await worker.fetch(new Request(`https://example.com/api/download-plan?${query}`), sourceEnv);
  assert.equal(planResponse.status, 200);
  const plan = await planResponse.json();
  assert.equal(plan.image, image);
  assert.equal(plan.repository, 'owner/image');
  assert.ok(plan.filename.startsWith('ghcr.io_owner_image_stable_sha256_'));
  assert.ok(paths.includes(`/v2/owner/image/manifests/${digest}`));
  const script = await worker.fetch(new Request(`https://example.com/api/download-script?${query}`), sourceEnv);
  assert.equal(script.status, 200);
  assert.match(await script.text(), /ghcr\.io\/owner\/image:stable/);
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

test('platform lookup preserves a valid manifest when its optional config request fails', async t => {
  const raw = JSON.stringify({ schemaVersion: 2, config: { digest: `sha256:${'a'.repeat(64)}`, size: 3 }, layers: [] });
  let mode = 'network';
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/manifests/')) return new Response(raw, { headers: { 'x-upstream': 'retained' } });
    if (mode === 'network') throw new Error('connection failed');
    return new Response('unavailable', { status: 503 });
  });
  for (mode of ['network', 'http']) {
    const response = await request('/api/platforms?image=nginx:latest&source=mirror-gcr');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-upstream'), 'retained');
    assert.equal(await response.text(), raw);
  }
});

test('platform lookup does not return a fallback manifest when config reading is cancelled', async t => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  let notify;
  const started = new Promise(resolve => { notify = resolve; });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('/manifests/')) return Response.json({ schemaVersion: 2, config, layers: [] });
    return new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      notify();
    } }));
  });
  const controller = new AbortController();
  const pending = worker.fetch(new Request('https://example.com/api/platforms?image=nginx&source=mirror-gcr', { signal: controller.signal }), env);
  await started;
  controller.abort();
  assert.notEqual((await pending).status, 200);
});

test('download endpoints reject an unverified platform when single-manifest config lookup fails', async t => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  let mode = 'network';
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/manifests/')) return Response.json({ schemaVersion: 2, config, layers: [] });
    if (mode === 'network') throw new Error('connection failed');
    if (mode === 'malformed') return new Response('not json');
    return new Response('unavailable', { status: 503 });
  });
  for (mode of ['network', 'malformed', 'http']) {
    const inspect = await request('/api/inspect?image=nginx&source=mirror-gcr&platform=linux%2Farm64');
    assert.equal((await inspect.json()).platform, 'linux/arm64');
    for (const endpoint of ['/api/download-plan', '/api/download-script']) {
      const response = await request(`${endpoint}?image=nginx&source=mirror-gcr&platform=linux%2Farm64`);
      assert.equal(response.status, 502, `${mode} ${endpoint}`);
      assert.match((await response.json()).error, /无法确认镜像架构/);
    }
  }
});

test('single-manifest metadata propagates cancellation while reading optional config', async t => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  let notify;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('/manifests/')) return Response.json({ schemaVersion: 2, config, layers: [] });
    return new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      notify();
    } }));
  });
  for (const endpoint of ['/api/inspect', '/api/download-plan', '/api/download-script']) {
    const started = new Promise(resolve => { notify = resolve; });
    const controller = new AbortController();
    const pending = worker.fetch(new Request(`https://example.com${endpoint}?image=nginx&source=mirror-gcr`, { signal: controller.signal }), env);
    await started;
    controller.abort();
    assert.notEqual((await pending).status, 200, endpoint);
  }
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
    assert.equal(new URL(url).searchParams.has('version'), false);
    assert.equal(init.headers.get('range'), 'bytes=0-2');
    source = new Response('abc', { status: 206, headers: { 'content-range': 'bytes 0-2/9' } });
    return source;
  });
  const response = await request('/v2/library/nginx/blobs/sha256:abc?version=current', { headers: { range: 'bytes=0-2' } });
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
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('/blobs/')
    ? Response.json({ os: 'linux', architecture: 'arm64', variant: 'v8' })
    : Response.json({ schemaVersion: 2, config, layers: [layer] }));
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
  const response = await worker.fetch(new Request('https://example.com/v2/r/hub/library/nginx/manifests/latest'), sourceEnv);
  assert.equal(await response.text(), 'manifest');
  await worker.fetch(new Request('https://example.com/v2/hub/team/app/manifests/latest?source=hub'), sourceEnv);
  await worker.fetch(new Request('https://example.com/v2/dkbst/hub/team/app/manifests/latest?source=hub'), sourceEnv);
  assert.deepEqual(paths, [
    'https://upstream.example/v2/library/nginx/manifests/latest',
    'https://upstream.example/v2/hub/team/app/manifests/latest',
    'https://upstream.example/v2/dkbst/hub/team/app/manifests/latest'
  ]);
  assert.equal((await worker.fetch(new Request('https://example.com/v2/r/hub/team/app/manifests/latest?source=other'), sourceEnv)).status, 400);
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


test('digest blobs allow one-day browser caching while errors and upstream restrictions are preserved', async t => {
  const path = `/v2/library/nginx/blobs/sha256:${'a'.repeat(64)}`;
  let upstream;
  t.mock.method(globalThis, 'fetch', async () => upstream);
  upstream = new Response('blob');
  const cached = await request(path + '?source=mirror-gcr');
  assert.equal(cached.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(cached.body, upstream.body);
  upstream = new Response('blob', { headers:{ 'cache-control':'no-store' } });
  assert.equal((await request(path + '?source=mirror-gcr')).headers.get('cache-control'),'no-store');
  upstream = new Response('missing', { status:404 });
  assert.equal((await request(path + '?source=mirror-gcr')).headers.get('cache-control'),null);
  upstream = new Response('manifest');
  assert.equal((await request('/v2/library/nginx/manifests/latest?source=mirror-gcr')).headers.get('cache-control'),null);
});

test('every GET API preserves explicit 405/Allow including HEAD without contacting upstream', async t => {
  t.mock.method(globalThis, 'fetch', () => { assert.fail('method rejection must happen before upstream work'); });
  const paths = ['/api/install/catalog', '/api/install/asset', '/api/install/plan', '/api/install/script', '/api/health', '/api/sources', '/api/platforms', '/api/inspect', '/api/download-script', '/api/share'];
  for (const path of paths) for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const response = await request(path, { method });
    assert.equal(response.status, 405, `${method} ${path}`);
    assert.equal(response.headers.get('allow'), 'GET');
  }
});

test('unknown API paths and trailing slashes stay JSON 404 while other paths use assets', async () => {
  for (const path of ['/api', '/api/unknown', '/api/install/unknown', '/api/health/', '/api/install/catalog/']) {
    for (const method of ['GET', 'POST']) {
      const response = await request(path, { method });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.deepEqual(await response.json(), { error: '接口不存在' });
    }
  }
  for (const path of ['/deep/link', '/api-other', '/v20']) assert.equal(await (await request(path)).text(), 'static page');
});

test('retired save remains 410 for every method', async () => {
  for (const method of ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS']) assert.equal((await request('/api/save', { method })).status, 410);
});

test('Registry routing preserves HEAD and streaming upload bodies instead of applying API guards', async t => {
  const paths = [];
  const upload = new Request('https://example.com/v2/team/image/blobs/uploads/id', { method: 'PATCH', body: 'payload', duplex: 'half' });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    paths.push(new URL(url).pathname);
    if (init.method === 'PATCH') {
      assert.equal(init.body, upload.body);
      assert.equal(await new Response(init.body).text(), 'payload');
      return new Response(null, { status: 202 });
    }
    assert.equal(init.method, 'HEAD');
    return new Response(null, { headers: { 'Docker-Content-Digest': 'sha256:test' } });
  });
  assert.equal((await worker.fetch(upload, env)).status, 202);
  for (const path of ['/v2', '/v2/', '/v2/team/image/manifests/latest']) {
    const response = await request(path, { method: 'HEAD' });
    assert.equal(response.status, 200); assert.equal(response.body, null);
    assert.equal(response.headers.get('Docker-Content-Digest'), 'sha256:test');
  }
  assert.deepEqual(paths, ['/v2/team/image/blobs/uploads/id', '/v2', '/v2/', '/v2/team/image/manifests/latest']);
});

test('unexpected handler failures still use the shared JSON 500 response', async () => {
  const response = await worker.fetch(new Request('https://example.com/asset'), { ASSETS: { fetch: async () => { throw new Error('asset failure'); } } });
  assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: 'asset failure' });
});


test('registry defaults come from config.js and JSON arrays or strings fully override them', async () => {
  const defaults = (await (await request('/api/sources')).json()).sources;
  assert.deepEqual(defaults.map(({ id, label, host }) => ({ id, label, host })),
    config.imageSources.map(({ id, label, url }) => ({ id, label, host: new URL(url).host })));
  const custom = [{ id: 'custom-json', label: 'Custom JSON', url: 'https://custom.example', naming: 'native', requiresNamespace: true }];
  for (const value of [custom, JSON.stringify(custom)]) {
    const response = await worker.fetch(new Request('https://example.com/api/sources'), { ...env, IMAGE_SOURCES: value });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).sources, [{ id: 'custom-json', label: 'Custom JSON', host: 'custom.example', naming: 'native', requiresNamespace: true }]);
  }
});

test('invalid JSON source overrides fail instead of silently using defaults', async () => {
  for (const value of [[], {}, 'not json', 'null', [null], [{ id: 'bad', label: 'Bad', url: 'http://upstream.example' }], [{ id: 'bad', label: 42, url: 'https://upstream.example' }]]) {
    const response = await worker.fetch(new Request('https://example.com/api/sources'), { ...env, IMAGE_SOURCES: value });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'IMAGE_SOURCES 配置无效' });
  }
});


test('registry proxy propagates cancellation to automatic and selected sources', async t => {
  const sourceEnv = { ...env, IMAGE_SOURCES: JSON.stringify([
    { id: 'one', label: 'One', url: 'https://one.example' },
    { id: 'two', label: 'Two', url: 'https://two.example' }
  ]) };
  let start;
  let started = new Promise(resolve => { start = resolve; });
  const signals = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => new Promise((_resolve, reject) => {
    signals.push(init.signal); start();
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  for (const suffix of ['?source=one', '?source=auto']) {
    const controller = new AbortController();
    const pending = worker.fetch(new Request(`https://example.com/v2/library/nginx/manifests/latest${suffix}`, { signal: controller.signal }), sourceEnv);
    await started;
    controller.abort();
    await pending;
    assert.equal(signals.at(-1).aborted, true);
    started = new Promise(resolve => { start = resolve; });
  }
});

test('cancelling automatic source selection aborts every concurrent upstream attempt', async t => {
  const sourceEnv = { ...env, IMAGE_SOURCES: JSON.stringify([
    { id: 'one', label: 'One', url: 'https://one.example' },
    { id: 'two', label: 'Two', url: 'https://two.example' }
  ]) };
  const signals = [];
  let bothStarted;
  const ready = new Promise(resolve => { bothStarted = resolve; });
  t.mock.method(globalThis, 'fetch', (_url, init) => new Promise((_resolve, reject) => {
    signals.push(init.signal);
    if (signals.length === 2) bothStarted();
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = worker.fetch(new Request('https://example.com/v2/library/nginx/manifests/latest?source=auto', { signal: controller.signal }), sourceEnv);
  await ready;
  controller.abort();
  await pending;
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal.aborted));
});


test('inspection counts each blob digest once and reports conflicting sizes as unknown', async t => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 40 };
  const layer = { digest: `sha256:${'b'.repeat(64)}`, size: 100 };
  let conflict = false;
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).pathname.includes('/blobs/')) return Response.json({ os: 'linux', architecture: 'amd64' });
    return Response.json({ schemaVersion: 2, config, layers: [layer, { ...layer, size: conflict ? 101 : 100 }] });
  });
  let response = await request('/api/inspect?image=nginx:latest&source=mirror-gcr');
  let data = await response.json();
  assert.equal(data.layers, 2);
  assert.equal(data.sizeBytes, 140);
  conflict = true;
  response = await request('/api/inspect?image=nginx:latest&source=mirror-gcr');
  data = await response.json();
  assert.equal(data.sizeBytes, null);
});

test('inspection reports unknown size for malformed layer descriptors', async t => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 40 };
  let layer = null;
  t.mock.method(globalThis, 'fetch', async url => new URL(url).pathname.includes('/blobs/')
    ? Response.json({ os: 'linux', architecture: 'amd64' })
    : Response.json({ schemaVersion: 2, config, layers: [layer] }));
  for (layer of [null, { digest: 123, size: 10 }]) {
    const response = await request('/api/inspect?image=nginx:latest&source=mirror-gcr');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sizeBytes, null);
  }
});

test('terminal downloads reject conflicting OCI blob sizes before producing a plan or script', async t => {
  const config = { digest: `sha256:${'a'.repeat(64)}`, size: 3 };
  const layer = { digest: `sha256:${'b'.repeat(64)}`, size: 4 };
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('/blobs/')
    ? Response.json({ os: 'linux', architecture: 'amd64' })
    : Response.json({ schemaVersion: 2, config, layers: [layer, { ...layer, size: 5 }] }));
  for (const path of ['/api/download-plan', '/api/download-script']) {
    const response = await request(`${path}?image=nginx&source=mirror-gcr`);
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /大小冲突/);
  }
});

test('cancelling metadata and download-plan requests aborts nested registry lookups', async t => {
  const digest = `sha256:${'a'.repeat(64)}`;
  let notify, mode;
  let started;
  const signals = [];
  t.mock.method(globalThis, 'fetch', (url, init) => {
    const path = new URL(url).pathname;
    const first = path.endsWith('/manifests/latest');
    if (first) {
      return Promise.resolve(Response.json(mode === 'plan'
        ? { schemaVersion: 2, manifests: [{ digest, platform: { os: 'linux', architecture: 'amd64' } }] }
        : { schemaVersion: 2, config: { digest, size: 3 }, layers: [] }));
    }
    return new Promise((_resolve, reject) => {
      signals.push(init.signal); notify();
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  });
  for (const [current, path] of [
    ['platform', '/api/platforms?image=nginx&source=mirror-gcr'],
    ['inspect', '/api/inspect?image=nginx&source=mirror-gcr'],
    ['plan', '/api/download-plan?image=nginx&source=mirror-gcr']
  ]) {
    mode = current; started = new Promise(resolve => { notify = resolve; });
    const controller = new AbortController();
    const pending = worker.fetch(new Request(`https://example.com${path}`, { signal: controller.signal }), env);
    await started; controller.abort(); await pending;
    assert.equal(signals.at(-1).aborted, true, current);
  }
});

test('automatic source selection releases discarded failure bodies', async t => {
  const sourceEnv = { ...env, IMAGE_SOURCES: JSON.stringify([
    { id: 'miss', label: 'Miss', url: 'https://miss.example' },
    { id: 'hit', label: 'Hit', url: 'https://hit.example' }
  ]) };
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).hostname === 'miss.example') return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 404 });
    return Response.json({ schemaVersion: 2, manifests: [] });
  });
  const response = await worker.fetch(new Request('https://example.com/api/platforms?image=nginx&source=auto'), sourceEnv);
  assert.equal(response.status, 200);
  assert.equal(cancelled, true);
});

test('successful Registry authentication releases the discarded challenge body', async t => {
  let calls = 0, cancelled = false;
  t.mock.method(globalThis, 'fetch', async url => {
    if (new URL(url).hostname === 'auth.example') return Response.json({ token: 'test-token' });
    if (calls++ === 0) return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 401, headers: { 'www-authenticate': 'Bearer realm="https://auth.example/token"' } });
    return Response.json({ schemaVersion: 2, manifests: [] });
  });
  const response = await request('/api/platforms?image=nginx&source=mirror-gcr');
  assert.equal(response.status, 200);
  assert.equal(cancelled, true);
});

test('platform resolution prefers exact matches and accepts variants only for generic requests', async t => {
  const config = { digest: `sha256:${'c'.repeat(64)}`, size: 3 };
  const layer = { digest: `sha256:${'d'.repeat(64)}`, size: 3 };
  const variantDigest = `sha256:${'a'.repeat(64)}`;
  const exactDigest = `sha256:${'b'.repeat(64)}`;
  let mode = 'direct', requested = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname; requested.push(path);
    if (path.includes('/blobs/')) return Response.json({ os: 'linux', architecture: 'arm64', variant: 'v8' });
    if (path.endsWith('/manifests/latest') && mode !== 'direct') return Response.json({ schemaVersion: 2, manifests: [
      { digest: variantDigest, platform: { os: 'linux', architecture: 'arm64', variant: 'v8' } },
      ...(mode === 'index' ? [{ digest: exactDigest, platform: { os: 'linux', architecture: 'arm64', variant: '' } }] : [])
    ] });
    return Response.json({ schemaVersion: 2, config, layers: [layer] });
  });
  const endpoint = platform => `/api/download-plan?image=nginx:latest&source=mirror-gcr&platform=${encodeURIComponent(platform)}`;
  let resolved = await request(endpoint('linux/arm64'));
  assert.equal(resolved.status, 200);
  const plan = await resolved.json();
  assert.equal(plan.platform, 'linux/arm64/v8');
  assert.equal(plan.filename, 'nginx_latest_linux_arm64_v8.tar');
  assert.equal((await request(endpoint('linux/arm64/v8'))).status, 200);
  assert.equal((await request(endpoint('linux/arm64/v9'))).status, 404);
  mode = 'index'; requested = [];
  resolved = await request(endpoint('linux/arm64'));
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).platform, 'linux/arm64');
  assert.ok(requested.some(path => path.endsWith(exactDigest)));
  requested = [];
  assert.equal((await request(endpoint('linux/arm64/v8'))).status, 200);
  assert.ok(requested.some(path => path.endsWith(variantDigest)));
  assert.equal((await request(endpoint('linux/arm64/v9'))).status, 404);
  mode = 'variant-only'; requested = [];
  resolved = await request(endpoint('linux/arm64'));
  assert.equal(resolved.status, 200);
  assert.equal((await resolved.json()).platform, 'linux/arm64/v8');
  assert.ok(requested.some(path => path.endsWith(variantDigest)));
});
