type ReleasePlatform = {
  id: string;
  fileName: string;
  size: number;
};

type ReleaseSummary = {
  name: string;
  version: string;
  publishedAt: string;
  platforms: ReleasePlatform[];
};

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  const formatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
  if (bytes >= 1_000_000_000) return `${formatter.format(bytes / 1_000_000_000)} GB`;
  if (bytes >= 1_000_000) return `${formatter.format(bytes / 1_000_000)} MB`;
  return `${formatter.format(bytes / 1_000)} KB`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `发布于 ${new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)}`;
}

async function loadReleaseMetadata() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-project]'));
  cards.forEach((card) => {
    const status = card.querySelector<HTMLElement>('[data-status]');
    if (status) status.textContent = '正在获取版本信息';
  });

  try {
    const response = await fetch('/api/releases', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Release metadata unavailable');

    const payload = await response.json() as { releases: Record<string, ReleaseSummary> };
    cards.forEach((card) => {
      const projectId = card.dataset.project || '';
      const release = payload.releases[projectId];
      if (!release) return;

      const version = card.querySelector<HTMLElement>('[data-version]');
      const releaseDate = card.querySelector<HTMLElement>('[data-release-date]');
      const status = card.querySelector<HTMLElement>('[data-status]');
      if (version) version.textContent = release.version;
      if (releaseDate) releaseDate.textContent = formatDate(release.publishedAt);
      if (status) status.textContent = '';

      card.querySelectorAll<HTMLAnchorElement>('[data-platform]').forEach((link) => {
        const platform = release.platforms.find((item) => item.id === link.dataset.platform);
        if (!platform) return;

        const size = link.querySelector<HTMLElement>('[data-file-meta]');
        if (size) size.textContent = formatSize(platform.size);
        link.title = platform.fileName;
        link.setAttribute(
          'aria-label',
          `下载 ${release.name} ${release.version} ${platform.fileName}，${formatSize(platform.size)}`,
        );
      });
    });
  } catch {
    cards.forEach((card) => {
      const status = card.querySelector<HTMLElement>('[data-status]');
      if (status) status.textContent = '版本信息暂不可用，仍可直接下载';
    });
  }
}

loadReleaseMetadata();
