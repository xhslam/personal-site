import {
  ReleaseError,
  getLatestRelease,
  resolvePlatformAsset,
} from '../../shared/releases.js';

function jsonError(status, message, headers = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function attachmentHeader(fileName) {
  const safeName = fileName.replace(/["\\\r\n]/g, '_');
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function copyResponseHeader(upstream, headers, name) {
  const value = upstream.headers.get(name);
  if (value) headers.set(name, value);
  return value;
}

export default async function onRequest({ request, env = {} }) {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return jsonError(405, '仅支持 GET 和 HEAD 请求', { Allow: 'GET, HEAD' });
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get('project') || '';
    const platformId = url.searchParams.get('platform') || '';
    const release = await getLatestRelease(projectId, { token: env.GITHUB_TOKEN });
    const { asset } = resolvePlatformAsset(projectId, platformId, release);

    const upstreamHeaders = {
      Accept: 'application/octet-stream',
      'User-Agent': 'personal-site-downloads',
    };
    const range = request.headers.get('range');
    const ifRange = request.headers.get('if-range');
    if (range) upstreamHeaders.Range = range;
    if (ifRange) upstreamHeaders['If-Range'] = ifRange;

    const upstream = await fetch(asset.browser_download_url, {
      method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new ReleaseError('安装包下载暂时不可用，请稍后重试', 502);
    }

    const headers = new Headers({
      'Content-Type': upstream.headers.get('content-type')
        || asset.content_type
        || 'application/octet-stream',
      'Content-Disposition': attachmentHeader(asset.name),
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
    });

    const contentLength = copyResponseHeader(upstream, headers, 'Content-Length');
    if (!contentLength && upstream.status === 200 && Number.isFinite(asset.size)) {
      headers.set('Content-Length', String(asset.size));
    }
    copyResponseHeader(upstream, headers, 'Content-Range');
    copyResponseHeader(upstream, headers, 'ETag');
    copyResponseHeader(upstream, headers, 'Last-Modified');
    if (!copyResponseHeader(upstream, headers, 'Accept-Ranges')) {
      headers.set('Accept-Ranges', 'bytes');
    }

    if (method === 'HEAD') {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers });
    }

    if (!upstream.body) {
      throw new ReleaseError('安装包下载暂时不可用，请稍后重试', 502);
    }

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    const status = error instanceof ReleaseError ? error.status : 502;
    const message = error instanceof ReleaseError
      ? error.message
      : '安装包下载暂时不可用，请稍后重试';
    return jsonError(status, message);
  }
}
