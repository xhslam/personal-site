import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

import handler from '../api/download.js';
import { clearReleaseCache } from '../api/_lib/releases.js';

const asset = {
  id: 1,
  name: 'Auris-1.0.48-arm64.dmg',
  size: 154210529,
  content_type: 'application/octet-stream',
  browser_download_url: 'https://github.com/xhslam/Auris/releases/download/v1.0.48/Auris-1.0.48-arm64.dmg',
};

const release = {
  tag_name: 'v1.0.48',
  name: 'Auris v1.0.48',
  published_at: '2026-11-18T03:19:49Z',
  assets: [asset],
};

class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
    this.headersSent = false;
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }

  writeHead(statusCode) {
    this.statusCode = statusCode;
    this.headersSent = true;
    return this;
  }

  _write(chunk, _encoding, callback) {
    this.headersSent = true;
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  end(...args) {
    this.headersSent = true;
    return super.end(...args);
  }

  body() {
    return Buffer.concat(this.chunks);
  }
}

function request(method = 'GET', query = 'project=auris&platform=mac-arm64', headers = {}) {
  return {
    method,
    url: `/api/download?${query}`,
    headers,
  };
}

function stubFetch(t, installerResponse = () => new Response('installer')) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'https://api.github.com/repos/xhslam/Auris/releases/latest') {
      return new Response(JSON.stringify(release), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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

test('only GET and HEAD are accepted', async (t) => {
  clearReleaseCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('fetch should not be called'); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = new MockResponse();
  await handler(request('POST'), response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.getHeader('allow'), 'GET, HEAD');
});

test('unknown projects are rejected without contacting GitHub', async (t) => {
  clearReleaseCache();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('fetch should not be called'); };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = new MockResponse();
  await handler(request('GET', 'project=unknown&platform=mac-arm64'), response);

  assert.equal(response.statusCode, 404);
  assert.match(response.body().toString(), /未知项目/);
});

test('GET streams the selected installer and preserves file headers', async (t) => {
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
  const response = new MockResponse();

  await handler(request(), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body().toString(), 'installer');
  assert.equal(response.getHeader('content-length'), '9');
  assert.equal(response.getHeader('accept-ranges'), 'bytes');
  assert.equal(response.getHeader('etag'), '"release-etag"');
  assert.match(response.getHeader('content-disposition'), /attachment/);
  assert.match(response.getHeader('content-disposition'), /Auris-1\.0\.48-arm64\.dmg/);
  assert.equal(calls[1].options.method, 'GET');
  assert.equal(calls[1].options.redirect, 'follow');
});

test('Range and If-Range are forwarded and partial responses stay partial', async (t) => {
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
  const response = new MockResponse();

  await handler(request('GET', undefined, { range: 'bytes=100-103', 'if-range': '"release-etag"' }), response);

  const upstreamHeaders = new Headers(calls[1].options.headers);
  assert.equal(upstreamHeaders.get('range'), 'bytes=100-103');
  assert.equal(upstreamHeaders.get('if-range'), '"release-etag"');
  assert.equal(response.statusCode, 206);
  assert.equal(response.getHeader('content-range'), 'bytes 100-103/154210529');
  assert.equal(response.body().toString(), 'part');
});

test('HEAD resolves the same asset without streaming a body', async (t) => {
  clearReleaseCache();
  const calls = stubFetch(t, () => new Response(null, {
    status: 200,
    headers: { 'Content-Length': String(asset.size) },
  }));
  const response = new MockResponse();

  await handler(request('HEAD'), response);

  assert.equal(calls[1].options.method, 'HEAD');
  assert.equal(response.statusCode, 200);
  assert.equal(response.getHeader('content-length'), String(asset.size));
  assert.equal(response.body().length, 0);
});

test('an upstream installer failure returns a controlled error', async (t) => {
  clearReleaseCache();
  stubFetch(t, () => new Response('not found', { status: 404 }));
  const response = new MockResponse();

  await handler(request(), response);

  assert.equal(response.statusCode, 502);
  assert.match(response.body().toString(), /安装包下载暂时不可用/);
});
