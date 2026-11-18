import {
  PROJECTS,
  ReleaseError,
  createReleaseSummary,
  getLatestRelease,
} from './_lib/releases.js';

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    sendJson(response, 405, { error: '仅支持 GET 请求' });
    return;
  }

  try {
    const entries = await Promise.all(
      Object.keys(PROJECTS).map(async (projectId) => {
        const release = await getLatestRelease(projectId);
        return [projectId, createReleaseSummary(projectId, release)];
      }),
    );

    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    sendJson(response, 200, { releases: Object.fromEntries(entries) });
  } catch (error) {
    const status = error instanceof ReleaseError ? error.status : 502;
    response.setHeader('Cache-Control', 'no-store');
    sendJson(response, status, { error: '版本信息暂时不可用，请稍后重试' });
  }
}
