import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../edge-functions/api/download.js';
import { clearReleaseCache } from '../shared/releases.js';

const asset = {
  name: 'Auris-1.0.48-arm64.dmg',
  size: 154210529,
  content_type: 'application/octet-stream',
  browser_download_url: 'https://github.com/xhslam/Auris/releases/download/v1.0.48/Auris-1.0.48-arm64.dmg',
};

const release = {
  tag_name: 'v1.0.48',
  published_at: '2026-11-18T03:19:49Z',
  assets: [asset],
};

function request(method = 'GET', query = 'project=auris&platform=mac-arm64', headers = {}) {
  return new Request(`https://example.com/api/download?${query}`, { method, headers });
}

function context(method = 'GET', query, headers) {
  return { request: request(method, query, headers), env: { GITHUB_TOKEN: 'test-token' } };
}

function stubFetch(t, installerResponse = () => new Response('installer')) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'https://api.github.com/repos/xhslam/Auris/releases/latest') {
      return Response.json(release);
    }
    if (url === asset.browser_download_url) return installerResponse();
    throw new Error(`Unexpected URL: ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearReleaseCache();
  });
  return calls;
}

test('EdgeOne download accepts only GET and HEAD', async (t) => {
  clearReleaseCache();
  stubFetch(t, async () => { throw new Error('fetch should not be called'); });

  const response = await handler(context('POST'));

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});

test('EdgeOne download rejects unknown projects without contacting GitHub', async (t) => {
  clearReleaseCache();
  stubFetch(t, async () => { throw new Error('fetch should not be called'); });

  const response = await handler(context('GET', 'project=unknown&platform=mac-arm64'));

  assert.equal(response.status, 404);
  assert.match((await response.json()).error, /未知项目/);
});

test('EdgeOne GET streams the selected installer and preserves file headers', async (t) => {
  clearReleaseCache();
  const calls = stubFetch(t, () => new Response('installer', {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': '9',
      'Accept-Ranges': 'bytes',
      ETag: '"release-etag"',
      'Last-Modified': 'Wed, 18 Nov 2026 00:00:00 GMT',
    },
  }));

  const response = await handler(context());

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'installer');
  assert.equal(response.headers.get('content-length'), '9');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('etag'), '"release-etag"');
  assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.match(response.headers.get('content-disposition'), /Auris-1\.0\.48-arm64\.dmg/);
  assert.equal(calls[1].options.method, 'GET');
  assert.equal(calls[1].options.redirect, 'follow');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('EdgeOne download forwards Range and If-Range and preserves 206', async (t) => {
  clearReleaseCache();
  const calls = stubFetch(t, () => new Response('part', {
    status: 206,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': '4',
      'Content-Range': 'bytes 100-103/154210529',
      'Accept-Ranges': 'bytes',
    },
  }));

  const response = await handler(context(
    'GET',
    undefined,
    { Range: 'bytes=100-103', 'If-Range': '"release-etag"' },
  ));

  assert.equal(calls[1].options.headers.Range, 'bytes=100-103');
  assert.equal(calls[1].options.headers['If-Range'], '"release-etag"');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 100-103/154210529');
  assert.equal(await response.text(), 'part');
});

test('EdgeOne HEAD resolves the same asset without returning a body', async (t) => {
  clearReleaseCache();
  const calls = stubFetch(t, () => new Response(null, {
    status: 200,
    headers: { 'Content-Length': String(asset.size) },
  }));

  const response = await handler(context('HEAD'));

  assert.equal(calls[1].options.method, 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), String(asset.size));
  assert.equal(response.body, null);
});

test('EdgeOne download converts upstream installer failures to a controlled 502', async (t) => {
  clearReleaseCache();
  stubFetch(t, () => new Response('not found', { status: 404 }));

  const response = await handler(context());

  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /安装包下载暂时不可用/);
});
