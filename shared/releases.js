const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const releaseCache = new Map();
const pendingRequests = new Map();

export class ReleaseError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ReleaseError';
    this.status = status;
  }
}

export const PROJECTS = {
  gamma: {
    name: 'Gamma',
    description: '本地优先的 AI 桌面 Agent',
    repository: 'Gamma',
    platforms: {
      'mac-arm64': {
        label: 'macOS',
        detail: 'Apple 芯片',
        matcher: /^Gamma-.+-mac-arm64\.dmg$/,
      },
      'mac-x64': {
        label: 'macOS',
        detail: 'Intel 芯片',
        matcher: /^Gamma-.+-mac-x64\.dmg$/,
      },
      'windows-x64': {
        label: 'Windows',
        detail: '64 位',
        matcher: /^Gamma-.+-win-x64\.exe$/,
      },
      'linux-appimage': {
        label: 'Linux',
        detail: 'AppImage',
        matcher: /^Gamma-.+-linux-x86_64\.AppImage$/,
      },
      'linux-deb': {
        label: 'Linux',
        detail: 'Debian / Ubuntu',
        matcher: /^Gamma-.+-linux-amd64\.deb$/,
      },
    },
  },
  auris: {
    name: 'Auris',
    description: '智能音频感知与交互平台',
    repository: 'Auris',
    platforms: {
      'mac-arm64': {
        label: 'macOS',
        detail: 'Apple 芯片',
        matcher: /^Auris-.+-arm64\.dmg$/,
      },
      'windows-x64': {
        label: 'Windows',
        detail: '64 位',
        matcher: /^Auris-.+-win-x64\.exe$/,
      },
    },
  },
  mira: {
    name: 'Mira',
    description: 'Android 应用',
    repository: 'Mira',
    platforms: {
      android: {
        label: 'Android',
        detail: 'APK',
        matcher: /^Mira-Android\.apk$/,
      },
    },
  },
};

function getProject(projectId) {
  const project = PROJECTS[projectId];
  if (!project) throw new ReleaseError('未知项目', 404);
  return project;
}

function findAsset(project, platformId, release) {
  const platform = project.platforms[platformId];
  if (!platform) throw new ReleaseError('该项目不支持该平台', 404);

  const asset = Array.isArray(release.assets)
    ? release.assets.find((candidate) => (
      typeof candidate.name === 'string'
      && platform.matcher.test(candidate.name)
      && typeof candidate.browser_download_url === 'string'
      && candidate.browser_download_url.startsWith(
        `https://github.com/xhslam/${project.repository}/releases/download/`,
      )
    ))
    : undefined;

  if (!asset) throw new ReleaseError('最新版本没有该平台的安装包', 404);
  return { project, platform, asset };
}

export function resolvePlatformAsset(projectId, platformId, release) {
  return findAsset(getProject(projectId), platformId, release);
}

export function createReleaseSummary(projectId, release) {
  const project = getProject(projectId);
  const platforms = Object.keys(project.platforms).flatMap((platformId) => {
    try {
      const { platform, asset } = findAsset(project, platformId, release);
      return [{
        id: platformId,
        label: platform.label,
        detail: platform.detail,
        fileName: asset.name,
        size: asset.size,
        downloadUrl: `/api/download?project=${projectId}&platform=${platformId}`,
      }];
    } catch (error) {
      if (error instanceof ReleaseError && error.status === 404) return [];
      throw error;
    }
  });

  return {
    name: project.name,
    version: release.tag_name,
    publishedAt: release.published_at,
    platforms,
  };
}

async function requestLatestRelease(projectId, token) {
  const project = getProject(projectId);
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'personal-site-downloads',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (typeof token === 'string' && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(
      `https://api.github.com/repos/xhslam/${project.repository}/releases/latest`,
      {
        headers,
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new ReleaseError('版本信息暂时不可用，请稍后重试', 502);
  }

  if (!response.ok) {
    await response.body?.cancel();
    throw new ReleaseError('版本信息暂时不可用，请稍后重试', 502);
  }

  try {
    const release = await response.json();
    if (typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) {
      throw new Error('Invalid release payload');
    }

    return {
      tag_name: release.tag_name,
      published_at: release.published_at,
      assets: release.assets.map((asset) => ({
        name: asset.name,
        size: asset.size,
        content_type: asset.content_type,
        browser_download_url: asset.browser_download_url,
      })),
    };
  } catch {
    throw new ReleaseError('版本信息格式异常', 502);
  }
}

export async function getLatestRelease(
  projectId,
  { cacheTtlMs = DEFAULT_CACHE_TTL_MS, token } = {},
) {
  getProject(projectId);

  const cached = releaseCache.get(projectId);
  if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) {
    return cached.release;
  }

  if (pendingRequests.has(projectId)) {
    return pendingRequests.get(projectId);
  }

  const request = requestLatestRelease(projectId, token)
    .then((release) => {
      releaseCache.set(projectId, { release, fetchedAt: Date.now() });
      return release;
    })
    .catch((error) => {
      if (cached) return cached.release;
      throw error;
    })
    .finally(() => {
      pendingRequests.delete(projectId);
    });

  pendingRequests.set(projectId, request);
  return request;
}

export function clearReleaseCache() {
  releaseCache.clear();
  pendingRequests.clear();
}
