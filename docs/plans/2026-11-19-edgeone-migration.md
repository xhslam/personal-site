# EdgeOne Makers Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate the Astro download site to Tencent EdgeOne Makers while preserving the same page URLs, release metadata API, installer proxy behavior, and a working Vercel rollback deployment.

**Architecture:** Keep Astro in static output mode and deploy `dist` together with file-based Edge Functions under `edge-functions/`. Move the release catalog and cache into a runtime-neutral shared module; retain a small Vercel wrapper that supplies `process.env.GITHUB_TOKEN`, while Edge Functions supply `context.env.GITHUB_TOKEN`. Stream installer bytes with Web `ReadableStream` and never buffer a full installer.

**Tech Stack:** Astro 7, JavaScript ES modules, Web Fetch/Request/Response/Streams APIs, EdgeOne Makers Edge Functions, Node.js test runner.

---

### Task 1: Make release metadata runtime-neutral

**Files:**
- Create: `shared/releases.js`
- Modify: `api/_lib/releases.js`
- Test: `tests/releases.test.js`
- Create: `tests/edgeone-releases.test.js`
- Create: `edge-functions/api/releases.js`

1. Add a failing Edge Function metadata test that invokes `onRequest({ request, env })`, expects the same `{ releases }` payload as Vercel, and verifies a fake `GITHUB_TOKEN` becomes an Authorization header without exposing it in the response.
2. Run `node --test tests/edgeone-releases.test.js`; expect module-not-found failure before implementation.
3. Move `PROJECTS`, `ReleaseError`, release matching, summaries, caching, request coalescing, and stale-cache fallback to `shared/releases.js`. Replace direct `process.env` access with a `token` option on `getLatestRelease(projectId, { token, cacheTtlMs })`.
4. Keep the existing Vercel import surface in `api/_lib/releases.js`; its `getLatestRelease` wrapper passes `process.env.GITHUB_TOKEN` to the shared module.
5. Add `edge-functions/api/releases.js` with a default `onRequest` handler. Allow GET only, read `context.env.GITHUB_TOKEN`, return JSON, and use the same cache headers and controlled errors as Vercel.
6. Run `node --test tests/releases.test.js tests/edgeone-releases.test.js`; expect all tests to pass.

### Task 2: Implement the EdgeOne streaming download function

**Files:**
- Create: `edge-functions/api/download.js`
- Create: `tests/edgeone-download.test.js`

1. Add failing Web API tests for GET, HEAD, POST rejection, unknown projects, attachment filename, streaming body, upstream failure, and forwarding `Range` plus `If-Range` while retaining a 206 response.
2. Run `node --test tests/edgeone-download.test.js`; expect module-not-found failure before implementation.
3. Implement a default `onRequest({ request, env })` handler. Resolve only assets in the shared whitelist, pass the environment token to release resolution, and fetch the selected GitHub asset with the incoming method and redirect following.
4. Return `new Response(method === 'HEAD' ? null : upstream.body, ...)`. Copy only explicit file headers: Content-Type, Content-Length, Content-Range, ETag, Last-Modified, and Accept-Ranges. Add Content-Disposition, private no-cache, and nosniff.
5. Do not use `node:stream`, `pipeline`, `arrayBuffer`, `blob`, or `text` for installer bodies. Cancel upstream bodies for HEAD and rejected upstream statuses.
6. Run `node --test tests/download.test.js tests/edgeone-download.test.js`; expect both Vercel and EdgeOne behavior to pass.

### Task 3: Add EdgeOne build configuration

**Files:**
- Create: `edgeone.json`
- Modify: `.gitignore`

1. Add `edgeone.json` with `installCommand: "npm install"`, `buildCommand: "npm run build"`, and `outputDirectory: "dist"`.
2. Do not add `@edgeone/astro`: this site remains static, and the two dynamic endpoints are standalone Edge Functions rather than Astro SSR routes.
3. Ignore `.edgeone/` local build/debug output and retain all existing environment-file ignores.
4. Run `npm install`, `npm run build`, and `node --test tests/*.test.js`; expect 15 static pages and all tests to pass.
5. Confirm no `.env*` file, real token, or local Vercel credential is tracked with `git status --short` and `git diff --check`.

### Task 4: Verify real release and installer behavior

**Files:**
- Create only outside the repository: temporary verification scripts in the session workbench.

1. Invoke the EdgeOne metadata handler against the real GitHub Releases API without printing credentials; expect Gamma, Auris, and Mira summaries with 5, 2, and 1 platforms.
2. Invoke HEAD for all eight EdgeOne download targets; expect 200, the expected Content-Length, and the expected attachment filename.
3. Invoke `Range: bytes=0-0` for all eight targets; expect 206, exactly one response byte, and the correct total size in Content-Range.
4. Compare the built `/downloads` HTML and client script paths with the Vercel version; ensure no-JavaScript download links remain `/api/download` URLs.
5. Commit source and tests with a `Made-with: Gamma` trailer and push `feat/edgeone-migration` for review; do not merge `main` or change Vercel production.

### Task 5: Deploy after account and domain prerequisites

**Files:**
- Create: `docs/deployment/edgeone.md` only if deployment-specific notes are needed.

1. Wait for the user to register and verify a Tencent Cloud account. The user handles passwords, SMS codes, payment, GitHub authorization, and any real PAT.
2. Create a Makers project from `feat/edgeone-migration`, initially using the available preview/deployment URL. Do not claim a stable mainland public URL without a custom domain.
3. If a token is needed, create a new fine-grained read-only PAT; never reuse the PAT previously exposed in chat. Configure `GITHUB_TOKEN` through the Makers environment-variable UI and redeploy.
4. Test the deployed `/downloads`, `/api/releases`, all eight HEAD requests, and representative or all eight one-byte Range requests.
5. Only after the user supplies a domain and approves DNS changes, bind the domain and switch CNAME. Mainland acceleration requires ICP filing; without it, use global excluding mainland and report measured rather than assumed performance.
6. Keep Vercel unchanged until EdgeOne production verification succeeds. If mainland GitHub origin fetching remains slow, evaluate a Tencent COS installer mirror without changing public download URLs.
