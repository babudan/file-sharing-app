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

MinIO is pulled from `quay.io/minio/minio` (the current official image; Docker Hub no longer serves it). Postgres and Node images still come from Docker Hub.

1. Register an account. A **Personal** workspace is created for you.
2. Create a team workspace, upload a file, and invite a colleague by email.
3. Open the invitation URL (shown in the UI, and emailed if SendGrid is configured) in another browser/session after registering with that email.
4. Create a share link and open it while signed out.

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
- **Storage** is behind `ObjectStorage` (`put` / `getStream` / `delete`). The S3 implementation is the only one shipped; swapping to disk would be a new class with the same interface.
- **Web** is a React SPA. In Docker it is same-origin with the API via nginx, so session cookies work without cross-site gymnastics.

## Assumptions and decisions

The brief left several product gaps. These are the calls I made.

### Accounts and sessions
Email + password. Session is an **httpOnly** JWT cookie (`fs_session`, 7 days, `SameSite=Lax`). I chose cookies over `localStorage` so XSS in the SPA cannot steal the token. There is no email verification; for a weekend take-home that is the usual trade-off.

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
Invite by email. That creates a pending invitation (7-day expiry) and a URL. If `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` are set, Ledger also sends the link through SendGrid. If they are missing or SendGrid fails, the invite is still created and the URL is shown in the UI. The invitee must register/sign in with **exactly that email**, then accept. Wrong account → rejected. I did not auto-add existing users: they should see that they were invited.

To enable email: create a SendGrid API key, verify the from-address (Sender Authentication), put both values in `.env`, then `docker compose up -d --force-recreate api`.

### Share links
A link is a 256-bit random `base64url` token (not a sequential id). Anyone with the URL can download, including signed-out users.

Defaults I chose:
- Optional expiry (UI defaults to 72 hours; omit for no expiry).
- Optional max download count.
- Optional password (this is the product improvement).
- Download-only. The outsider cannot list the workspace or upload.
- Creator (or any workspace member) can revoke.
- Deleted documents make the link look invalid (404), not “this used to exist”.

Guessing tokens is not a practical attack; I still rate-limit the public share routes.

### Deletion
Documents are **soft-deleted** so share checks and audit-ish history stay coherent. The object is then deleted from MinIO best-effort. Workspace delete **cascades** metadata and is blocked for Personal. Orphan objects are possible if the process crashes between DB and S3; see “with more time”.

### Uploads
25MB cap. Allow-list of document/image/zip/text types. Original filename is sanitized and **not** used as the object key prefix; keys look like `workspaces/{workspaceId}/documents/{documentId}/{filename}`. Files are downloaded as `Content-Disposition: attachment` through the API, never as a public MinIO URL.

### File size in memory
Multer buffers the file, then `PutObject`. Fine at 25MB; I would stream multipart to S3 if the limit grew.

## Security considerations

Addressed:
- Authorization is membership-based. Another user’s workspace/document returns **404**, not 403, so you cannot probe ids.
- Storage is not exposed. No public bucket, no presigned URLs in the client.
- Share tokens are long and random. Passwords on links are bcrypt-hashed like account passwords.
- Auth and public download routes are rate-limited.
- Helmet, cookie flags, `X-Content-Type-Options: nosniff`, attachment downloads.
- SQL via Prisma parameterized queries.

Knowingly left:
- No virus scanning, no malware sandbox.
- No CSRF token (same-site cookie + JSON API; fine for this app, not for arbitrary cross-site form posts).
- No SSO, 2FA, or email verification.
- JWT secret defaults in compose — change `JWT_SECRET` in `.env` before any real use.
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

Where I steered or would push back in a review:
- Storage and authorization must not live in route handlers. The agent’s first shape already split `ObjectStorage` and domain helpers; I kept tests on those helpers (permissions, share access, filename sanitization) because those are the parts that would embarrass me if they broke.
- Share links must not be guessable, and MinIO must stay off the public network. Compose publishes only `:8080`.
- Invitations for users who do not exist yet need an explicit accept step, not silent account creation.
- I would not accept a design that stored files in Postgres or served the bucket directly to the browser.

The follow-up interview can walk `domain/permissions.ts`, `domain/shareAccess.ts`, `services/documentService.ts`, and `storage.ts` — those are the decisions, not the CSS.

## What I’d do next with more time

- Stream uploads to S3 and add a background janitor for orphaned objects / expired shares.
- “File shared with you” notifications (invites already email via SendGrid).
- Folders + search inside a workspace.
- Document versioning (keep prior objects, point metadata at the current key).
- Audit log of downloads and membership changes.
- Real CSRF strategy if the API is ever used from a second origin.

## Local development without rebuilding Docker for every change

```bash
docker compose up db minio
# terminal 1
cd api && cp ../.env.example .env && npx prisma migrate deploy && npm run dev
# terminal 2
cd web && npm run dev
```

API: http://localhost:3000 — Web: http://localhost:5173 (Vite proxies `/api`).
