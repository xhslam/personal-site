import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROJECTS,
  clearReleaseCache,
  createReleaseSummary,
  getLatestRelease,
  resolvePlatformAsset,
} from '../api/_lib/releases.js';

const gammaAssets = [
  ['Gamma-0.19.285-mac-arm64.dmg', 355529879],
  ['Gamma-0.19.285-mac-x64.dmg', 366222237],
  ['Gamma-0.19.285-win-x64.exe', 317486618],
  ['Gamma-0.19.285-linux-x86_64.AppImage', 405218190],
  ['Gamma-0.19.285-linux-amd64.deb', 292610090],
  ['Gamma-0.19.285-mac-arm64.dmg.blockmap', 373050],
].map(([name, size], index) => ({
  id: index + 1,
  name,
  size,
  content_type: 'application/octet-stream',
  browser_download_url: `https://github.com/xhslam/Gamma/releases/download/v0.19.285/${name}`,
}));

function releasePayload(assets = gammaAssets) {
  return {
    tag_name: 'v0.19.285',
    name: 'Gamma v0.19.285',
    published_at: '2026-11-15T16:46:03Z',
    assets,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch(t, handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearReleaseCache();
  });
}

test('release catalog contains only the supported installer platforms', () => {
  assert.deepEqual(Object.keys(PROJECTS), ['gamma', 'auris', 'mira']);
  assert.deepEqual(Object.keys(PROJECTS.gamma.platforms), [
    'mac-arm64',
    'mac-x64',
    'windows-x64',
    'linux-appimage',
    'linux-deb',
  ]);
  assert.deepEqual(Object.keys(PROJECTS.auris.platforms), ['mac-arm64', 'windows-x64']);
  assert.deepEqual(Object.keys(PROJECTS.mira.platforms), ['android']);
});

test('summary maps installer assets to stable same-origin download links', () => {
  const summary = createReleaseSummary('gamma', releasePayload());

  assert.equal(summary.version, 'v0.19.285');
  assert.equal(summary.platforms.length, 5);
  assert.deepEqual(summary.platforms[0], {
    id: 'mac-arm64',
    label: 'macOS',
    detail: 'Apple 芯片',
    fileName: 'Gamma-0.19.285-mac-arm64.dmg',
    size: 355529879,
    downloadUrl: '/api/download?project=gamma&platform=mac-arm64',
  });
  assert.ok(summary.platforms.every((platform) => !platform.fileName.endsWith('.blockmap')));
});

test('asset resolution rejects unknown projects, platforms, and missing assets', () => {
  const selected = resolvePlatformAsset('gamma', 'windows-x64', releasePayload());
  assert.equal(selected.asset.name, 'Gamma-0.19.285-win-x64.exe');

  assert.throws(() => resolvePlatformAsset('unknown', 'windows-x64', releasePayload()), /未知项目/);
  assert.throws(() => resolvePlatformAsset('mira', 'windows-x64', releasePayload()), /不支持该平台/);
  assert.throws(() => resolvePlatformAsset('auris', 'mac-arm64', releasePayload([])), /没有该平台的安装包/);
});

test('latest releases are cached and concurrent requests share one API call', async (t) => {
  clearReleaseCache();
  let calls = 0;
  stubFetch(t, async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.github.com/repos/xhslam/Gamma/releases/latest');
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse(releasePayload());
  });

  const [first, second] = await Promise.all([
    getLatestRelease('gamma'),
    getLatestRelease('gamma'),
  ]);
  const third = await getLatestRelease('gamma');

  assert.equal(calls, 1);
  assert.equal(first.tag_name, 'v0.19.285');
  assert.equal(second, first);
  assert.equal(third, first);
});

test('a stale cached release remains available during a GitHub API outage', async (t) => {
  clearReleaseCache();
  let calls = 0;
  stubFetch(t, async () => {
    calls += 1;
    return calls === 1 ? jsonResponse(releasePayload()) : jsonResponse({ message: 'rate limited' }, 403);
  });

  await getLatestRelease('gamma');
  const fallback = await getLatestRelease('gamma', { cacheTtlMs: 0 });

  assert.equal(calls, 2);
  assert.equal(fallback.tag_name, 'v0.19.285');
});

test('an uncached GitHub API failure becomes a controlled upstream error', async (t) => {
  clearReleaseCache();
  stubFetch(t, async () => jsonResponse({ message: 'rate limited' }, 403));

  await assert.rejects(
    getLatestRelease('gamma'),
    (error) => error.status === 502 && /版本信息暂时不可用/.test(error.message),
  );
});
