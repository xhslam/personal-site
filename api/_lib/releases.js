import { getLatestRelease as getSharedLatestRelease } from '../../shared/releases.js';

export {
  PROJECTS,
  ReleaseError,
  clearReleaseCache,
  createReleaseSummary,
  resolvePlatformAsset,
} from '../../shared/releases.js';

export function getLatestRelease(projectId, options = {}) {
  return getSharedLatestRelease(projectId, {
    ...options,
    token: process.env.GITHUB_TOKEN,
  });
}
