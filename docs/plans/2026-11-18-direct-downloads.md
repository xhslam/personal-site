# Direct Project Downloads Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let visitors download the latest Gamma, Auris, and Mira installers through same-origin website links without opening GitHub.

**Architecture:** A static Astro download center exposes stable `/api/download` links. Vercel Node.js functions resolve the latest allowlisted GitHub Release asset and stream it to the visitor, forwarding range and file metadata headers. A separate metadata endpoint updates version and file-size labels in the browser.

**Tech Stack:** Astro 7, Vercel Node.js Functions, GitHub Releases API, Node.js built-in test runner.

---

### Task 1: Release catalog and metadata API

**Files:**
- Create: `api/_lib/releases.js`
- Create: `api/releases.js`
- Test: `tests/releases.test.js`

**Steps:**
1. Define an allowlist for Gamma, Auris, and Mira, including repository names, supported platforms, labels, and asset-name matchers.
2. Write tests for platform resolution, missing assets, API failures, and cache behavior.
3. Implement five-minute in-memory release caching and optional `GITHUB_TOKEN` authentication without storing credentials in the repository.
4. Expose `GET /api/releases` with CDN caching and a JSON payload containing version, publication date, file name, size, and same-origin download URL for every available platform.
5. Run `node --test tests/releases.test.js` and expect all tests to pass.

### Task 2: Same-origin installer streaming

**Files:**
- Create: `api/download.js`
- Modify: `vercel.json`
- Test: `tests/download.test.js`

**Steps:**
1. Write tests for allowlist validation, HEAD, GET, Range forwarding, response headers, and upstream errors.
2. Implement only GET and HEAD; reject other methods with `Allow: GET, HEAD`.
3. Resolve only the configured release asset for `project` and `platform`, then stream the upstream body without buffering the installer.
4. Forward `Range` and `If-Range`; preserve content length, content range, ETag, last-modified, and accepted ranges; force an attachment filename.
5. Configure a 300-second function duration and exclude public media from function bundles.
6. Run `node --test tests/download.test.js` and expect all tests to pass.

### Task 3: Download center and site navigation

**Files:**
- Create: `src/pages/downloads.astro`
- Create: `src/scripts/downloads.ts`
- Modify: `src/components/Nav.astro`
- Modify: `src/components/Footer.astro`
- Modify: `src/components/Works.astro`

**Steps:**
1. Build a responsive download page with stable same-origin links for macOS, Windows, Linux, and Android variants actually published by each project.
2. Keep the links functional without JavaScript; progressively enhance version, release date, filename, and file-size labels from `/api/releases`.
3. Add clear loading and metadata-failure states without disabling the stable download links.
4. Add download navigation and connect project cards/footer entries to the relevant page anchors.
5. Keep the existing visual system and avoid unrelated content changes.

### Task 4: Verification

**Files:**
- Review all files above.

**Steps:**
1. Run `node --test tests/*.test.js` and expect all tests to pass.
2. Run `npm run build` and expect a successful Astro production build.
3. Call the real metadata function and verify the latest release/platform mappings for all three projects.
4. Issue HEAD and ranged GET requests against representative installer responses without downloading complete installers.
5. Inspect the rendered download page at desktop and mobile sizes and check all navigation targets.
6. Review `git diff` and report any deployment requirements, especially optional `GITHUB_TOKEN` configuration and Vercel duration limits.
