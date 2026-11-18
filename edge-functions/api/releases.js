import {
  PROJECTS,
  ReleaseError,
  createReleaseSummary,
  getLatestRelease,
} from '../../shared/releases.js';

function jsonResponse(status, payload, cacheControl) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  });
}

export default async function onRequest({ request, env = {} }) {
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: '仅支持 GET 请求' }), {
      status: 405,
      headers: {
        Allow: 'GET',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  try {
    const entries = await Promise.all(
      Object.keys(PROJECTS).map(async (projectId) => {
        const release = await getLatestRelease(projectId, { token: env.GITHUB_TOKEN });
        return [projectId, createReleaseSummary(projectId, release)];
      }),
    );

    return jsonResponse(
      200,
      { releases: Object.fromEntries(entries) },
      'public, s-maxage=300, stale-while-revalidate=3600',
    );
  } catch (error) {
    const status = error instanceof ReleaseError ? error.status : 502;
    return jsonResponse(
      status,
      { error: '版本信息暂时不可用，请稍后重试' },
      'no-store',
    );
  }
}
