# Ledger — file storage & sharing

A small full-stack app for a team that needs to keep documents, invite colleagues into a workspace, and send a link to someone outside the team.

Stack: Node.js, TypeScript, Express, PostgreSQL (Prisma), MinIO (S3 API), React.

## How to run (under 5 minutes)

You need Docker Desktop.

```bash
cp .env.example .env
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080).

MinIO is pulled from `quay.io/minio/minio` (Docker Hub no longer serves it). Postgres and Node images still come from Docker Hub.

1. Register an account. A **Personal** workspace is created for you.
2. Create a team workspace, upload a file (25 MB max), and invite a colleague by email.
3. Open the invitation URL (shown in the UI, and emailed if SendGrid is configured) after registering with that same email.
4. Create a share link and open it while signed out.

Stop when you are done (data in Docker volumes is kept):

```bash
docker compose down
```

Start again later without rebuilding:

```bash
docker compose up -d
```

Tests (from `api/`):

```bash
npm test
```

## Architecture

```
Browser  →  nginx (:8080)  →  React SPA
                 └── /api/*  →  Express API
                                   ├── PostgreSQL (metadata, membership, share tokens)
                                   └── MinIO / S3 (file bytes only)
```

- **API** owns auth, authorization, and streaming downloads. MinIO is not published to the host.
- **Postgres** stores users, workspaces, memberships, invitations, document metadata, and share links. File contents never go in the database.
- **Storage** is behind `ObjectStorage` (`put` / `getStream` / `delete`). The S3 implementation talks to MinIO locally; swapping to real S3 is an env-var change.
- **Web** is a React SPA. In Docker it is same-origin with the API via nginx, so session cookies work without cross-site gymnastics.

## Assumptions and decisions

The brief left several product gaps. These are the calls I made.

### Accounts and sessions
Email + password. Session is an **httpOnly** JWT cookie (`fs_session`, 7 days, `SameSite=Lax`). I chose cookies over `localStorage` so XSS in the SPA cannot steal the token.

Login and register are rate-limited (**50 failed attempts per 15 minutes**). `/api/auth/me` is not, because the UI calls it on navigation.

### Where files live
Every document belongs to a **workspace**. On signup I auto-create a Personal workspace so the first upload does not require extra ceremony. Team workspaces are separate; Personal cannot have extra members (create a team workspace instead).

### Who can do what
All members of a workspace can see and download every document in it. A small team sharing a folder is the model, not per-file ACLs.

| Action | Owner | Admin | Member |
|---|---|---|---|
| Upload, download, create share links | yes | yes | yes |
| Invite | yes (admin or member) | yes (member only) | no |
| Remove members | yes (not the owner) | members only | no |
| Delete any document | yes | yes | only files they uploaded |
| Delete workspace | yes | no | no |

Removing a member does **not** delete files they uploaded. The workspace owns the document.

### Invitations for people without an account
Invite by email. That creates a pending invitation (**7-day expiry**) and a URL. The invitee must register/sign in with **exactly that email**, then accept. Wrong account → rejected.

If `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are set, the same link is emailed. If they are missing or SendGrid fails, the invite is still created and the URL is shown in the UI.

To enable email:

1. Create a SendGrid API key (it must start with `SG.` — Mailgun keys will not work).
2. Verify the from-address under Sender Authentication.
3. Put both values in `.env` (never commit `.env`).
4. Recreate the API: `docker compose up -d --force-recreate api`.

`SENDGRID_FROM_NAME` is only the display name in the inbox (for example `Ledger`), not the sending address.

### Share links
A link is a 256-bit random `base64url` token (not a sequential id). Anyone with the URL can download, including signed-out users.

Each **Create link** makes a **new independent URL**. You can have several for the same file (different people, expiry, or password). **Revoke** turns off only that one link. The UI copies the newest URL and lists active links with Copy / Revoke.

Options:
- **Expires in hours** — the link dies after that time (UI default 72). Independent of downloads.
- **Max downloads** — the link dies after that many successful downloads (empty = no cap). The public page shows remaining downloads.
- **Password (optional)** — public page asks for it before showing the filename or allowing download. Unlock is a short-lived httpOnly cookie.

Also:
- Download-only. The outsider cannot list the workspace or upload.
- Deleted documents make the link look invalid (404), not “this used to exist”.
- Public share/download responses are not cached, so a used-up one-download link does not keep working from the browser cache.

### Uploads
**25 MB** cap, checked in the browser first so oversized files get a plain message (not nginx HTML). Allow-list of document/image/zip/text types. Original filename is sanitized and **not** used as the object key prefix; keys look like `workspaces/{workspaceId}/documents/{documentId}/{filename}`. Files are downloaded as `Content-Disposition: attachment` through the API, never as a public MinIO URL.

Multer buffers the file, then `PutObject`. Fine at 25 MB; I would stream multipart to S3 if the limit grew.

### Deletion
Documents are **soft-deleted**. The object is then deleted from MinIO best-effort. Workspace delete **cascades** metadata and is blocked for Personal. Orphan objects are possible if the process crashes between DB and S3.

## Security considerations

Addressed:
- Authorization is membership-based. Another user’s workspace/document returns **404**, not 403, so you cannot probe ids.
- Storage is not exposed. No public bucket, no presigned URLs in the client.
- Share tokens are long and random. Passwords on links are bcrypt-hashed like account passwords.
- Login/register and public share routes are rate-limited.
- Helmet, cookie flags, `X-Content-Type-Options: nosniff`, attachment downloads.
- SQL via Prisma parameterized queries.
- `.env` is gitignored. `.env.example` has empty placeholders only.

Knowingly left:
- No virus scanning, no malware sandbox.
- No CSRF token (same-site cookie + JSON API; fine for this app, not for arbitrary cross-site form posts).
- No SSO, 2FA, or email verification.
- Change `JWT_SECRET` in `.env` before any real use.
- MinIO credentials are local demo defaults.
- Share unlock is a second httpOnly cookie; one active unlock at a time per browser.
- Uploads sit in API memory briefly (DoS surface if you raised the size limit without streaming).

## Product improvement (built): password-protected share links

A real user sending a contract to a client often cannot rely on “the link is the secret” — links get forwarded into Slack, tickets, and email threads. A password sent on a second channel (call, SMS, different email) is the smallest extra control that still matches the product.

What I built:
- Optional password when creating a link.
- Public page asks for the password before showing the filename or allowing download.
- Success sets a short-lived unlock cookie so the download can proceed without putting the password in the query string.

I chose this over folders or virus scanning because it closes a hole in the brief’s main “share outside the team” story without pretending to be an enterprise DLP suite.

## How I worked with the agent

I used **Cursor**. I pointed it at the assignment PDF, required Node.js + TypeScript, and told it to fill the brief’s gaps as a product team would rather than implementing only the sentences on the page.

What I delegated: project layout, Prisma schema/migration, Docker Compose, React UI, and the first pass of services/routes.

Where I steered after using the app:
- Share links must not be guessable, and MinIO must stay off the public network. Compose publishes only `:8080`.
- Invitations for users who do not exist yet need an explicit accept step, not silent account creation.
- Rate-limiting `/api/auth/me` together with login locked testers out; the limiter now applies only to login/register.
- Oversized uploads were hitting nginx `413` HTML; the UI now checks 25 MB first.
- One-download share links looked reusable because the browser cached the page/file; downloads are no-store and the public page shows remaining count.
- SendGrid keys must start with `SG.` (Mailgun sending keys will not work).
- I would not accept a design that stored files in Postgres or served the bucket directly to the browser.

The follow-up interview can walk `domain/permissions.ts`, `domain/shareAccess.ts`, `services/documentService.ts`, and `storage.ts`.

## What I’d do next with more time

- Stream uploads to S3 and add a background janitor for orphaned objects / expired shares.
- “File shared with you” notifications (workspace invites already email via SendGrid).
- Folders + search inside a workspace.
- Document versioning (keep prior objects, point metadata at the current key).
- Audit log of downloads and membership changes.
- Real CSRF strategy if the API is ever used from a second origin.

## Local development without rebuilding Docker for every change

```bash
docker compose up db minio
# terminal 1
cd api && npx prisma migrate deploy && npm run dev
# terminal 2
cd web && npm run dev
```

API: http://localhost:3000 — Web: http://localhost:5173 (Vite proxies `/api`).
