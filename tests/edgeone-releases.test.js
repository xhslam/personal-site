import test from 'node:test';
import assert from 'node:assert/strict';

import handler from '../edge-functions/api/releases.js';
import { clearReleaseCache } from '../shared/releases.js';

const catalog = {
  Gamma: {
    tag: 'v0.19.285',
    assets: [
      'Gamma-0.19.285-mac-arm64.dmg',
      'Gamma-0.19.285-mac-x64.dmg',
      'Gamma-0.19.285-win-x64.exe',
      'Gamma-0.19.285-linux-x86_64.AppImage',
      'Gamma-0.19.285-linux-amd64.deb',
    ],
  },
  Auris: {
    tag: 'v1.0.48',
    assets: ['Auris-1.0.48-arm64.dmg', 'Auris-1.0.48-win-x64.exe'],
  },
  Mira: {
    tag: 'android-100005',
    assets: ['Mira-Android.apk'],
  },
};

function releasePayload(repository) {
  const { tag, assets } = catalog[repository];
  return {
    tag_name: tag,
    published_at: '2026-11-18T00:00:00Z',
    assets: assets.map((name, index) => ({
      name,
      size: 1000 + index,
      content_type: 'application/octet-stream',
      browser_download_url: `https://github.com/xhslam/${repository}/releases/download/${tag}/${name}`,
    })),
  };
}

function stubFetch(t, handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearReleaseCache();
  });
  return calls;
}

function context(method = 'GET', env = {}) {
  return {
    request: new Request('https://example.com/api/releases', { method }),
    env,
  };
}

test('EdgeOne metadata returns the same release catalog and uses the injected token', async (t) => {
  clearReleaseCache();
  const calls = stubFetch(t, async (url) => {
    const match = /^https:\/\/api\.github\.com\/repos\/xhslam\/(Gamma|Auris|Mira)\/releases\/latest$/.exec(url);
    if (!match) throw new Error(`Unexpected URL: ${url}`);
    return Response.json(releasePayload(match[1]));
  });

  const response = await handler(context('GET', { GITHUB_TOKEN: 'test-token' }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, s-maxage=300, stale-while-revalidate=3600');
  assert.deepEqual(Object.keys(payload.releases), ['gamma', 'auris', 'mira']);
  assert.equal(payload.releases.gamma.platforms.length, 5);
  assert.equal(payload.releases.auris.platforms.length, 2);
  assert.equal(payload.releases.mira.platforms.length, 1);
  assert.equal(payload.releases.mira.version, 'android-100005');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer test-token'));
  assert.ok(!JSON.stringify(payload).includes('test-token'));
});

test('EdgeOne metadata rejects non-GET requests without contacting GitHub', async (t) => {
  clearReleaseCache();
  stubFetch(t, async () => { throw new Error('fetch should not be called'); });

  const response = await handler(context('POST'));

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('EdgeOne metadata converts uncached upstream failures to a controlled 502', async (t) => {
  clearReleaseCache();
  stubFetch(t, async () => Response.json({ message: 'rate limited' }, { status: 403 }));

  const response = await handler(context());

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match((await response.json()).error, /版本信息暂时不可用/);
});
