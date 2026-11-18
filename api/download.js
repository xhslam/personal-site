import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  ReleaseError,
  getLatestRelease,
  resolvePlatformAsset,
} from './_lib/releases.js';

function sendError(response, status, message) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({ error: message }));
}

function attachmentHeader(fileName) {
  const safeName = fileName.replace(/["\\\r\n]/g, '_');
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function copyResponseHeader(upstream, response, name) {
  const value = upstream.headers.get(name);
  if (value) response.setHeader(name, value);
  return value;
}

export default async function handler(request, response) {
  const method = request.method?.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendError(response, 405, '仅支持 GET 和 HEAD 请求');
    return;
  }

  try {
    const url = new URL(request.url || '', 'http://localhost');
    const projectId = url.searchParams.get('project') || '';
    const platformId = url.searchParams.get('platform') || '';
    const release = await getLatestRelease(projectId);
    const { asset } = resolvePlatformAsset(projectId, platformId, release);

    const upstreamHeaders = {
      Accept: 'application/octet-stream',
      'User-Agent': 'personal-site-downloads',
    };
    if (typeof request.headers?.range === 'string') {
      upstreamHeaders.Range = request.headers.range;
    }
    if (typeof request.headers?.['if-range'] === 'string') {
      upstreamHeaders['If-Range'] = request.headers['if-range'];
    }

    const upstream = await fetch(asset.browser_download_url, {
      method,
      headers: upstreamHeaders,
      redirect: 'follow',
    });

    if (!upstream.ok) {
      await upstream.body?.cancel();
      throw new ReleaseError('安装包下载暂时不可用，请稍后重试', 502);
    }

    response.statusCode = upstream.status;
    response.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || asset.content_type || 'application/octet-stream',
    );
    response.setHeader('Content-Disposition', attachmentHeader(asset.name));
    response.setHeader('Cache-Control', 'private, no-cache');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    const contentLength = copyResponseHeader(upstream, response, 'Content-Length');
    if (!contentLength && upstream.status === 200 && Number.isFinite(asset.size)) {
      response.setHeader('Content-Length', String(asset.size));
    }
    copyResponseHeader(upstream, response, 'Content-Range');
    copyResponseHeader(upstream, response, 'ETag');
    copyResponseHeader(upstream, response, 'Last-Modified');
    if (!copyResponseHeader(upstream, response, 'Accept-Ranges')) {
      response.setHeader('Accept-Ranges', 'bytes');
    }

    if (method === 'HEAD') {
      await upstream.body?.cancel();
      response.end();
      return;
    }

    if (!upstream.body) {
      throw new ReleaseError('安装包下载暂时不可用，请稍后重试', 502);
    }

    await pipeline(Readable.fromWeb(upstream.body), response);
  } catch (error) {
    if (response.headersSent) {
      response.destroy();
      return;
    }

    const status = error instanceof ReleaseError ? error.status : 502;
    const message = error instanceof ReleaseError
      ? error.message
      : '安装包下载暂时不可用，请稍后重试';
    sendError(response, status, message);
  }
}
