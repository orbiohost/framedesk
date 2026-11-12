# FrameDesk

Workspace for creative studios: clients, projects, tasks, schedule, raw and edited files, team access and client review. JavaScript only: Node/Express/Mongoose API, React/Vite/Tailwind client.

**Build status:** Phases 1–2 done (auth, workspaces, clients, projects, tasks, calendar). The file manager core from Phase 4 (folders, resumable uploads, quotas, trash, previews of images, video, audio and PDF) is in; file notes, versions, thumbnails and video proxies are still to come.

## Requirements

- Node.js 20.19+ (22 LTS recommended)
- A MongoDB database (MongoDB Atlas free tier is fine for development)

## Setup

```bash
npm install                       # installs server + client (npm workspaces)
cp server/.env.example server/.env
# edit server/.env: set MONGODB_URI and JWT_ACCESS_SECRET at minimum
npm run dev                       # API on :4000, web on :5173
```

Open http://localhost:5173. The API refuses to start if `.env` is invalid, and it lists every problem it found.

With `MAIL_TRANSPORT=console`, emails (verification, password reset) are printed in the API log instead of being sent. Copy the link from there.

## Scripts (run from the repo root)

| Command              | What it does                                               |
| -------------------- | ---------------------------------------------------------- |
| `npm run dev`        | API (node --watch) and Vite dev server together            |
| `npm run lint`       | ESLint for server and client                               |
| `npm run format`     | Prettier                                                   |
| `npm run build`      | Production build of the client into `client/dist`          |
| `npm run audit:deps` | `npm audit` of production dependencies                     |

## Project layout

```
server/src
  config/        env validation (fails fast), constants, db connection
  middleware/    authenticate, loadWorkspace, validate (Zod), csrf, rate limits, errors
  modules/       one folder per feature: *.routes, *.controller, *.service, *.model, *.validation
  utils/         AppError, response helpers, logger, crypto, mailer, workspaceScope plugin
client/src
  app/           router, providers
  features/      API calls, hooks and components per feature (auth, users, workspaces)
  components/ui  primitives (Button, TextField, Card, Alert, Skeleton…)
  layouts/       AuthLayout, AppLayout, Sidebar
  pages/         route-level screens
  lib/           api client, formatting, small helpers
```

Request flow: `routes → controller (thin) → service (business logic) → model`. Controllers never query the database.

## Conventions

**API responses** always have one of two shapes:

```json
{ "success": true, "data": { … }, "meta": { … } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "field": "email", "message": "…" }] } }
```

Throw `AppError` from services (`AppError.notFound()`, `AppError.forbidden()`…). The central error handler also maps Mongoose, JWT and body-parser errors.

**Tenant isolation.** Every workspace-owned model uses `workspaceScopePlugin`. It adds `workspaceId` and makes any query without a `workspaceId` filter throw. A missed filter becomes a crash in development, not a data leak. A deliberate cross-workspace read must opt in with `.setOptions({ crossWorkspace: true })`. Workspace routes are mounted under `/api/workspaces/:workspaceId/...` behind `authenticate` and `loadWorkspace`, which 404s for non-members.

**Auth.** Access token: a 15-minute JWT in an httpOnly cookie. Refresh token: random, stored only as a SHA-256 hash, used once and rotated on every refresh, sent only to `/api/auth`. Reusing an old refresh token revokes that whole login session. Every authenticated request checks that its session is still live, so logout and revocation take effect immediately. CSRF uses a double-submit cookie (`csrf_token` cookie + `X-CSRF-Token` header). Passwords are hashed with argon2id. Accounts lock for 15 minutes after 5 failed logins.

## File storage

All uploaded files live in an Amazon S3 bucket. S3-compatible stores (Cloudflare R2, MinIO, Wasabi) work too through `S3_ENDPOINT`. `S3_BUCKET` and `S3_REGION` are required; the API refuses to start without them.

- Files are stored under `<workspaceId>/<yyyy-mm>/<uuid>` (plus `S3_KEY_PREFIX`). The original file name is only kept in the database.
- Uploads go **straight from the browser into S3** as a multipart upload (`/api/uploads`): the API checks permission, type, size and quota, hands out presigned part links (16 MB parts, 4 in parallel), and when every part is in it joins them, checks the real file type from the first bytes and creates the file. The bytes never pass through the server or touch its disk. Uploads resume after a dropped connection, a pause or a page reload (for a day); abandoned ones are aborted in S3 by an hourly sweep.
- Before upload, MP4/MOV/M4A files get their index moved to the front in the browser (no re-encode, same size), so videos start playing at once. Files uploaded earlier can be fixed with `docker compose exec api npm run optimize:media` (add `-- --dry` to just list them).
- Quota is checked before the first byte and claimed atomically when the upload completes. Files in Trash still count until they are deleted for good.
- Downloads and previews are short-lived signed S3 links (15 minutes), so video streams straight from S3, with Range support, and never passes through the API. The bucket stays private.

### Setting up the bucket

- **1. Create the bucket:** in the region you set as `S3_REGION`, leave "Block all public access" on.
- **2. Add a CORS rule:** start from [deploy/s3-cors.json](deploy/s3-cors.json) and replace the origin with your `CLIENT_URL`. Uploads (PUT, with the ETag header exposed), video thumbnails and in-browser conversion talk to S3 directly and need it. Without it uploads fail with "Storage is not set up for direct uploads".
- **2b. Clean up abandoned uploads (recommended):** add a lifecycle rule to the bucket: "Delete expired object delete markers or incomplete multipart uploads", incomplete multipart uploads after 2 days. The API aborts them itself, but this catches any it missed.
- **3. Give the API access:** use an IAM user or role with [deploy/s3-iam-policy.json](deploy/s3-iam-policy.json), with your bucket name filled in. On EC2 or ECS, attach it to the instance or task role and leave `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` empty.
- **4. Files from older versions:** earlier versions could keep files on the server disk. Copy them into the bucket with `npm run migrate:local-to-s3 -w server -- --dry`, then again without `--dry` (add `--from <dir>` if they are not in `server/data/uploads`). It is safe to re-run and never deletes local files.
- **Transcripts:** Whisper can't read the bucket, so the API sends it a signed link that lasts 24 hours, and Whisper downloads the file to a temporary file when the job starts. The Whisper container needs outbound internet access to S3.
- **Admin dashboard:** there is no server-disk storage card, because a bucket has no fixed size. Per-workspace quotas work as before.

## Transcripts & dictation (Whisper)

A `whisper` container runs [faster-whisper](https://github.com/SYSTRAN/faster-whisper): the free OpenAI Whisper weights (`large-v3` by default) on a faster engine, fully self-hosted. Nothing leaves the server.

- **Video/audio transcripts:** in the file viewer, **Transcript** → pick the language (or auto-detect), optionally _Translate to English_. Lines appear while it works; click a timestamp to jump there, search the text, copy it, or download `.txt`, `.srt` or `.vtt` subtitles. Editors and up start transcripts; viewers can read them.
- **Dictated notes:** the mic button on the dashboard Notes widget records up to 2 minutes and appends the text to your note (needs HTTPS for microphone access).

How it fits together: the API stores each transcript in MongoDB (`transcripts` module) and a small worker in the API process sends queued files to Whisper one at a time, copying segments back as they arrive. Whisper reads uploads straight from the shared volume (read-only), sits only on the internal Docker network, and checks a shared `WHISPER_API_KEY`. Restarts on either side are safe: a job Whisper lost is queued again (up to 3 times). Deleting a file for good deletes its transcript.

Local development (with `npm run dev`): put `WHISPER_API_KEY` (and optionally `WHISPER_MODEL`) in the `.env` next to `docker-compose.yml`, set `WHISPER_URL=http://localhost:9000` plus the same `WHISPER_API_KEY` in `server/.env`, then run `docker compose -f docker-compose.dev.yml up -d --build` and restart `npm run dev`. That file runs only Whisper, on 127.0.0.1:9000, downloading files from signed S3 links.

Production setup: add `WHISPER_API_KEY=<random 32+ chars>` to the `.env` next to `docker-compose.yml`, then `docker compose up -d --build`. The first start downloads the model (~1.6 GB for large-v3-turbo) into the `whisper_models` volume, and transcription waits until it is loaded. Without `WHISPER_URL` set (e.g. local `npm run dev`) the feature is hidden.

| Setting (compose `.env`) | Default          | Notes                                                                                     |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------- |
| `WHISPER_MODEL`          | `large-v3-turbo` | `large-v3` is slightly more accurate but several times slower on a CPU                    |
| `WHISPER_CPU_THREADS`    | `0` (all cores)  | Whisper runs at low CPU priority (`WHISPER_NICE`, default 10), so the app stays responsive |
| `WHISPER_BEAM_SIZE`      | `1` on CPU       | `5` = beam search: a little more accurate, roughly 2x slower                              |
| `WHISPER_BATCH_SIZE`     | `8` on CPU       | 30 s pieces decoded at once; `0` turns batching off (less RAM, slower)                    |

**Hardware.** With the defaults (`large-v3-turbo`, greedy, batched) a 1-hour video takes very roughly 10–30 minutes on 4–8 CPU cores and about 2–3 GB of RAM. `large-v3` with beam search needs 4–5 GB RAM and can take 1–3 hours for the same file. With an NVIDIA GPU: `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build` (needs the NVIDIA Container Toolkit), where an hour of video takes a few minutes.

Transcripts are not yet part of workspace backups.

## Client caching

- **Query cache on disk** (`client/src/lib/queryPersistence.js`): React Query data is saved to localStorage (2 MB cap, 24 h max age), so pages render at once after a reload and refetch in the background. It is tied to the signed-in user, never restores who is signed in, skips admin, chat and backup data, and is wiped on sign-in/sign-out. Bump `CACHE_VERSION` when an API response shape changes.
- **Signed links** (`client/src/lib/signedUrlCache.js`): a file's link is reused for up to 10 minutes, so reopening a file hits the browser's HTTP cache. Hovering a file row fetches its link early (and small images).
- **Converted media** (`browserConvert.js`): conversions done in the browser are kept in Cache Storage (newest 4, up to 800 MB each), so reopening an AVI/WMV plays immediately.

## Workspace backup & restore

Owners and admins get **Backup** in the sidebar.

- **Download** streams a zip: `manifest.json`, `README.txt`, `data/*.json` (clients, projects, folders, tasks, events, files, members) and, optionally, `files/<project>/<folder>/<name>` with the uploaded bytes. A date range keeps records created or changed in that period, plus the projects, clients and folders they belong to. Storage keys never appear in the zip.
- **Restore** merges: anything missing comes back with its original id and dates; anything that exists (in any workspace) is left untouched. A backup only restores into the workspace it came from. Files are restored only from bytes in the zip, through the same type check and storage quota as uploads. Team memberships are never restored.
- Every backup and restore is written to the audit log and shown in the page's History.
- Restores upload in a single request (up to `MAX_RESTORE_GB`); the API allows requests up to an hour long for this. Behind Nginx, give `/api/workspaces/*/backups/restore` a matching `client_max_body_size` and `proxy_request_buffering off`.

## Deployment (single VPS)

1. Build the client: `npm ci && npm run build`. Serve `client/dist` as static files.
2. Run the API with PM2: `cd server && pm2 start ecosystem.config.cjs --env production`.
3. Put Nginx (or OpenLiteSpeed) in front, with HTTPS. Serve the client and the API from **the same origin** so cookies stay first-party:

```nginx
server {
  server_name app.example.com;
  root /var/www/framedesk/client/dist;

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

4. In production `.env`, set `NODE_ENV=production`, `COOKIE_SECURE=true`, `TRUST_PROXY=1`, `MAIL_TRANSPORT=smtp` plus the SMTP settings. The server won't start without them.

## Scaling notes

- Redis (the `redis` service in `docker-compose.yml`, `REDIS_URL` in the API) caches the lookups every request makes: session user, session liveness, workspace, membership and storage pool. Without it, that's three sequential MongoDB round trips per request. Writes made through Mongoose (and session revocations) invalidate the cache straight away, using per-document generation counters (`server/src/utils/cache.js`), so logouts, suspensions and plan changes still apply at once. Writes from another process (the `server/scripts`) show up within the 60-second TTL.
- Rate limits are counted in Redis too, so they're shared across instances and survive restarts.
- Redis is optional: if `REDIS_URL` is empty or Redis is down, the cache is skipped and rate limits are counted in memory. After a reconnect the whole cache is invalidated, because writes may have been missed meanwhile.
- The API is stateless. To run several instances, raise `instances` in `ecosystem.config.cjs` (Redis already holds the shared state).
- Background work (emails, previews, trash cleanup, AI suggestions) moves to a BullMQ worker process in Phase 4. Emails already go through a single function, `deliverEmailInBackground`, so only that function changes.
- File storage will sit behind a driver interface (Phase 4), so moving from local disk to S3/R2 plus a CDN needs no service changes.

## Backups

Covered in Phase 9: a daily `mongodump` to off-server storage, and a weekly copy of the uploads directory.
