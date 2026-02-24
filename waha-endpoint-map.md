# WAHA Endpoint Map (Live-Verified)

Verified on: 2026-02-24
Source config: `/home/lofa/.openclaw/openclaw.json`
Account: `channels.whatsapp.accounts.work`
Transport: `waha`

## Effective WAHA config (masked)

- `baseUrl`: `https://waha3.lotfinity.tech`
- `session`: `default`
- `apiKey`: configured (masked)

## Auth behavior (important)

This WAHA deployment accepts:

- `X-Api-Key: <key>` header

This deployment rejects:

- `Authorization: Bearer <key>`
- `?x-api-key=<key>` query param
- missing auth

## Endpoint matrix (observed)

### Health / surface

- `GET /health` -> `200` JSON (`status: ok`, disk/media/session space details)
- `GET /api/health` -> `404`
- `GET /` -> `401`
- `GET /api` -> `401`

### Session status

- `GET /api/sessions` (with `X-Api-Key`) -> `200` JSON array
  - Includes `name`, `status`, `me`, `timestamps`
- `GET /api/sessions/default` (with `X-Api-Key`) -> `200` JSON object
  - Includes `engine.engine=WEBJS`, `engine.state=CONNECTED`
- Same endpoints without valid `X-Api-Key` -> `401`

### QR / login

- `GET /api/default/auth/qr?format=raw` (with `X-Api-Key`) -> `422` when already connected
- `GET /api/default/auth/qr?format=image` (with `X-Api-Key`) -> `422` when already connected
- 422 body indicates session is `WORKING` and expected `SCAN_QR_CODE`

Interpretation:

- `422` here is normal if the session is already linked/working.
- QR endpoints return usable QR only when session status is `SCAN_QR_CODE`.

### Media files

- `GET /api/files/...` requires `X-Api-Key`
- Without auth -> `401`
- With auth and non-existent path -> `404`

Interpretation:

- Media download failures are often one of:
  - wrong host/port/path
  - missing `X-Api-Key` header
  - expired/invalid file path from message payload

### Docs / OpenAPI discovery

- `GET /swagger`, `/swagger.json`, `/openapi.json`, `/api-json`, `/docs` -> `401`
- `GET /api/docs`, `/api/docs/json` -> `404`

Interpretation:

- API docs are not publicly available on this deployment path/auth setup.

## How OpenClaw currently uses WAHA

- Login start/wait path is WAHA-aware (`startWahaLoginWithQr`, `waitForWahaLogin`).
- Uses WAHA endpoints for session start, status, and QR retrieval.
- Inbound media loader fetches WAHA-provided media URL/path.
- Channel `Logout` currently clears local OpenClaw auth state; it does not explicitly stop WAHA session via WAHA stop/logout endpoint.

## Error tracing quick map

### If inbound text works but media is missing

1. Confirm WAHA session healthy:
   - `GET /health` -> `200`
   - `GET /api/sessions/default` -> status `WORKING`
2. Confirm media URL host/port is reachable from OpenClaw host.
3. Confirm fetch includes `X-Api-Key` header (this deployment requires it).
4. If media URL has wrong host/port, rewrite/pin to configured WAHA `baseUrl` host.
5. If URL is valid but returns `404`, media object may be missing/expired server-side.

### If QR flow fails

1. Check `/api/sessions/default` status.
2. If `WORKING`, QR endpoint `422` is expected.
3. If `SCAN_QR_CODE`, `/api/default/auth/qr?format=image` should return bytes.

### If everything returns 401

- You are not using `X-Api-Key` header correctly for this deployment.

## Repro commands (Node 22+, no curl)

Use Node `fetch` probes with `X-Api-Key` header for all WAHA requests.
Avoid relying on bearer/query-key auth on this instance.
