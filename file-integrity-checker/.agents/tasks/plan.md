# Implementation Plan — File Integrity Checker Security Overhaul

## Project Root
`c:\Users\Santhosh MR\Downloads\New folder\file-integrity-checker`

## Build & Test Commands
- **Server start:** `cd server && npm start` (or `npm run dev` for nodemon)
- **Server tests:** `cd server && npm test`
- **Client build:** `cd client && npm run build`
- **Client dev:** `cd client && npm run dev`

## Execution Order

Dependencies flow: Models → Services → Middleware → Controllers → Routes → App.js → Frontend → Tests

---

## FEAT-001 — SHA-256 Architecture Fix + Key Persistence

### What currently exists and what must change

**`server/src/models/MonitoredFile.js`**
- Currently: single `sha256` field used as both trusted baseline and latest hash
- Must change: remove `sha256`; add `baselineSha256: { type: String, required: true }` and `currentSha256: { type: String, required: true }`; update indexes from `sha256:1` to `baselineSha256:1` and `currentSha256:1`

**`server/src/models/SecurityAlert.js`**
- Currently: no `createdBy` field — alerts are globally visible
- Must change: add `createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }` and `index({ createdBy: 1 })`

**`server/src/models/KeyPair.js`** *(NEW)*
- Replaces in-memory `privateKeyStore` Map in signatureController
- Fields: `keyId` (String, unique, required), `publicKey` (String PEM), `privateKeyEncrypted` (String PEM, select:false in production — stored plaintext for demo), `createdBy` (ObjectId ref User), timestamps
- Indexes: `keyId:1`, `createdBy:1`

**`server/src/services/integrityService.js`**
- `createBaseline()`: On upsert of existing file → set BOTH `baselineSha256` AND `currentSha256` = computed hash; create audit log `rebaseline_performed` recording old baseline. On first creation → set both fields equal, `status='safe'`. Emit events via `emitToFolderOwner` (wired in FEAT-004; use `emitToAll` stub until then)
- `scanFolder()`: Compare `currentHash` against `monitoredFile.baselineSha256`. On MODIFIED → set `currentSha256 = currentHash` only; **never touch `baselineSha256`**. On SAFE → set `currentSha256 = currentHash`. On DELETED → no hash change, `status='deleted'`. On NEW → set both fields = computed hash, `status='new'`

**`server/src/services/monitoringService.js`**
- `handleFileEvent()`: On `change` → compare new hash against `baselineSha256`; set `currentSha256` only on change. On `add` re-add → compare against `baselineSha256`, set `currentSha256` only. On `unlink` → no hash changes

**`server/src/routes/verify.js`**
- `POST /verify/file/:id`: change `file.sha256` → `file.baselineSha256` as the trusted reference value

**`server/src/controllers/versionController.js`**
- FileVersion records store `sha256` of that version snapshot — this is correct and unchanged. Add ownership guard on parent file lookup (inline)

**`server/src/controllers/folderController.js`**
- `createBaseline()`: If `folder.baselineCreatedAt` already set AND `req.body.confirm !== true`, return `409` with message: "Baseline already exists. Send confirm:true to rebaseline — this is a security-sensitive operation."

**`server/src/controllers/signatureController.js`**
- `generateKeys()`: Save to `KeyPair` model instead of `privateKeyStore` Map. Return only `keyId` + `publicKey`
- `signFile()`: Look up `KeyPair.findOne({ keyId, createdBy: req.user._id })` (admin can query any); retrieve `privateKeyEncrypted`

**`server/src/services/signatureService.js`**
- `signHash()`: change `crypto.createSign('SHA256')` → `crypto.createSign('RSA-SHA256')`
- `verifySignature()`: change `crypto.createVerify('SHA256')` → `crypto.createVerify('RSA-SHA256')`

**`server/src/services/reportService.js`**
- `generateCSVReport()`: update columns from `sha256` → `baselineSha256` and `currentSha256`

**`server/src/services/alertService.js`**
- `createAlert()`: accept optional `createdBy` param; set on SecurityAlert record

---

- [ ] 1. **MonitoredFile model — split sha256 field**
      Remove `sha256`, add `baselineSha256` (String, required) and `currentSha256` (String, required). Update two indexes.
      Files: `server/src/models/MonitoredFile.js`
      Verify: `node -e "const m=require('./src/models/MonitoredFile'); const s=m.schema.obj; console.log(!!s.baselineSha256, !!s.currentSha256, !!s.sha256)"` → `true true false`

- [ ] 2. **SecurityAlert model — add createdBy**
      Add `createdBy` ObjectId field with index.
      Files: `server/src/models/SecurityAlert.js`
      Verify: `node -e "const m=require('./src/models/SecurityAlert'); console.log(!!m.schema.obj.createdBy)"` → `true`

- [ ] 3. **Create KeyPair model**
      New Mongoose model with `keyId`, `publicKey`, `privateKeyEncrypted`, `createdBy`, timestamps.
      Files: `server/src/models/KeyPair.js` *(new)*
      Verify: `node -e "require('./src/models/KeyPair'); console.log('OK')"` → `OK`

- [ ] 4. **Update alertService to accept createdBy**
      Add optional `createdBy` param to `createAlert()`; pass it to `SecurityAlert.create()`.
      Files: `server/src/services/alertService.js`
      Verify: server starts without crash

- [ ] 5. **Update integrityService — createBaseline and scanFolder**
      `createBaseline`: set both `baselineSha256`+`currentSha256`; on re-baseline create audit log.
      `scanFolder`: compare against `baselineSha256`; update only `currentSha256` on MODIFIED.
      Files: `server/src/services/integrityService.js`
      Verify: `cd server && node src/app.js` starts without crash (Ctrl+C after connected)

- [ ] 6. **Update monitoringService handleFileEvent**
      Use `baselineSha256`/`currentSha256` correctly in all three event branches.
      Files: `server/src/services/monitoringService.js`
      Verify: server starts without crash

- [ ] 7. **Update signatureService to use RSA-SHA256**
      Change `createSign('SHA256')` → `createSign('RSA-SHA256')` and matching verify.
      Files: `server/src/services/signatureService.js`
      Verify: `node -e "const s=require('./src/services/signatureService'); s.generateKeyPair().then(({publicKey,privateKey})=>{ const r=s.signBuffer(Buffer.from('test'),privateKey); console.log('verify:', s.verifyBufferSignature(Buffer.from('test'),r.signature,publicKey)); })"` → `verify: true`

- [ ] 8. **Update signatureController to persist keys in KeyPair model**
      `generateKeys()` saves to DB. `signFile()` looks up from DB. `getSignatureById()` adds owner check.
      Files: `server/src/controllers/signatureController.js`
      Verify: server starts without crash

- [ ] 9. **Add rebaseline confirmation guard in folderController**
      Return 409 when `folder.baselineCreatedAt` exists and `req.body.confirm !== true`.
      Files: `server/src/controllers/folderController.js`
      Verify: server starts without crash

- [ ] 10. **Update verify route to use baselineSha256**
       Change `file.sha256` → `file.baselineSha256` in `POST /verify/file/:id`.
       Files: `server/src/routes/verify.js`
       Verify: server starts without crash

- [ ] 11. **Update reportService CSV columns**
       Headers and row values updated from `sha256` → `baselineSha256` + `currentSha256`.
       Files: `server/src/services/reportService.js`
       Verify: server starts without crash

---

## FEAT-002 — Registration Security + Resource Authorization

### What currently exists and what must change

**`server/src/controllers/authController.js`**
- Currently: `const assignedRole = role === 'admin' ? 'admin' : 'analyst'` — reads `role` from `req.body`, allows role escalation
- Must change: `const finalRole = userCount === 0 ? 'admin' : 'analyst'` — body role is never used

**`server/src/middleware/ownership.js`** *(NEW)*
- `assertFolderAccess(folder, req)` → boolean
- `filterByOwner(query, req)` → mutates query object with `createdBy` filter for non-admins
- `requireOwnership(Model, ownerField)` → Express middleware factory (for future use)

**`server/src/controllers/folderController.js`**
- `getFolderById`, `getFolderFiles`, `deleteFolder`, `createBaseline`, `scanFolder`: add `assertFolderAccess` check after findById

**`server/src/controllers/fileController.js`**
- `getFileById`, `deleteFile`: add owner check (`file.createdBy.toString() === req.user._id.toString() || role==='admin'`, else 403)

**`server/src/controllers/alertController.js`**
- `getAlerts`: add `filterByOwner` for non-admins
- `markRead`, `resolveAlert`, `deleteAlert`: fetch alert first, check ownership
- `markAllRead`: scope to `{ createdBy: req.user._id }` for non-admins

**`server/src/controllers/versionController.js`**
- All three methods: fetch parent file, check ownership before returning versions

**`server/src/controllers/reportController.js`**
- `downloadReport`, `deleteReport`: ownership check on `report.generatedBy`
- `generateReport`: if `folderId` provided, verify folder ownership

**`server/src/controllers/networkController.js`**
- `getResultById`: check `record.createdBy === req.user._id || admin`

**`server/src/controllers/signatureController.js`**
- `getSignatureById`: ownership check

**`server/src/controllers/userController.js`**
- `deleteUser`, `updateUser`, `toggleUserStatus`: last-admin protection guard

**`server/src/controllers/monitoringController.js`**
- `start`, `stop`, `pause`, `resume`: fetch folder, assertFolderAccess
- `getStatus`: filter by owner for non-admins

**`server/src/routes/users.js`** + **`server/src/controllers/userController.js`**
- Add `POST /` route and `createUser` controller method (admin-only user creation with any role)

---

- [ ] 12. **Fix authController register — remove role escalation**
       `finalRole = userCount === 0 ? 'admin' : 'analyst'` — no more `req.body.role`.
       Files: `server/src/controllers/authController.js`
       Verify: `node -e "const src=require('fs').readFileSync('./src/controllers/authController.js','utf8'); console.log('safe:', !src.includes(\"role === 'admin'\") || src.match(/userCount === 0/))"` → `safe: truthy`

- [ ] 13. **Create ownership middleware**
       Export `assertFolderAccess(folder, req)`, `filterByOwner(query, req)`.
       Files: `server/src/middleware/ownership.js` *(new)*
       Verify: `node -e "const o=require('./src/middleware/ownership'); console.log(typeof o.assertFolderAccess, typeof o.filterByOwner)"` → `function function`

- [ ] 14. **Apply folder authorization in folderController**
       `getFolderById`, `getFolderFiles`, `deleteFolder`, `createBaseline`, `scanFolder`: each calls `assertFolderAccess` after fetch.
       Files: `server/src/controllers/folderController.js`
       Verify: server starts without crash

- [ ] 15. **Apply file authorization in fileController**
       `getFileById` and `deleteFile` check ownership; else 403.
       Files: `server/src/controllers/fileController.js`
       Verify: server starts without crash

- [ ] 16. **Apply alert authorization in alertController**
       `getAlerts` filters by owner for analysts. Mutation endpoints check ownership.
       Files: `server/src/controllers/alertController.js`
       Verify: server starts without crash

- [ ] 17. **Apply version authorization in versionController**
       All three endpoints check parent file ownership.
       Files: `server/src/controllers/versionController.js`
       Verify: server starts without crash

- [ ] 18. **Apply report/network/signature authorization**
       `downloadReport`, `deleteReport`, `generateReport` (folder check), `getResultById`, `getSignatureById` all check ownership.
       Files: `server/src/controllers/reportController.js`, `server/src/controllers/networkController.js`, `server/src/controllers/signatureController.js`
       Verify: server starts without crash

- [ ] 19. **Add last-admin protection in userController**
       `deleteUser`, `updateUser` (role demotion), `toggleUserStatus` (deactivation) check admin count.
       Files: `server/src/controllers/userController.js`
       Verify: server starts without crash

- [ ] 20. **Apply monitoring authorization in monitoringController**
       `start`, `stop`, `pause`, `resume` check folder ownership. `getStatus` filters for non-admins.
       Files: `server/src/controllers/monitoringController.js`
       Verify: server starts without crash

- [ ] 21. **Add createUser to userController + POST /api/users route**
       Admin can create user with any role via `POST /api/users`.
       Files: `server/src/controllers/userController.js`, `server/src/routes/users.js`
       Verify: server starts without crash

---

## FEAT-003 — Dashboard Data Isolation + Hash Input Validation

### What currently exists and what must change

**`server/src/controllers/dashboardController.js`**
- Currently: all `countDocuments()` and `find()` calls are global — no user filter
- Must change: for analysts, filter all queries. For admins, keep global behavior
  - `MonitoredFile.*` queries add `{ createdBy: req.user._id }` filter
  - `MonitoredFolder.*` queries add `{ createdBy: req.user._id }` filter
  - `SecurityAlert.*` queries add `{ createdBy: req.user._id }` filter
  - `DigitalSignature.*` queries add `{ createdBy: req.user._id }` filter
  - `IntegrityEvent.*` queries: first find user's folder IDs, then `{ folderId: { $in: folderIds } }`
  - `AuditLog` recent logs: admin only; analysts get `[]`
  - `alertSeverityBreakdown` aggregate: add `$match` stage for analyst
  - `eventsOverTime` aggregate: add `folderId $in` filter for analyst

**`server/src/services/reportService.js`**
- `buildReportData()`: accept `userId` + `userRole` params; scope `MonitoredFile.find()` and `SecurityAlert.find()` for analysts

**`server/src/controllers/reportController.js`**
- Pass `req.user._id`, `req.user.role` to `buildReportData()`

**`server/src/routes/verify.js`** and **`server/src/routes/files.js`**
- Add `body('expectedHash').matches(/^[a-fA-F0-9]{64}$/)` validation

---

- [ ] 22. **Isolate dashboard data per user role**
       `getStats()` uses role-scoped queries for all models.
       Files: `server/src/controllers/dashboardController.js`
       Verify: `node -e "const src=require('fs').readFileSync('./src/controllers/dashboardController.js','utf8'); console.log('Has role check:', src.includes('req.user.role'))"` → `Has role check: true`

- [ ] 23. **Scope buildReportData to user**
       Accept `userId` + `userRole`; filter MonitoredFile and SecurityAlert queries.
       Files: `server/src/services/reportService.js`, `server/src/controllers/reportController.js`
       Verify: server starts without crash

- [ ] 24. **Add hash input validation on verify and file verify routes**
       Both `POST /verify/hash` and `POST /files/verify` validate `expectedHash` against `/^[a-fA-F0-9]{64}$/`.
       Files: `server/src/routes/verify.js`, `server/src/routes/files.js`
       Verify: `node -e "const src=require('fs').readFileSync('./src/routes/verify.js','utf8'); console.log('Has hex validation:', src.includes('[a-fA-F0-9]{64}'))"` → `Has hex validation: true`

---

## FEAT-004 — Socket.IO Security + Monitoring Service Fixes + Scheduler + Recovery

### What currently exists and what must change

**`server/src/websocket/socketManager.js`**
- Currently: `subscribe:monitoring` accepts any folderId without checking access
- Currently: `emitToAll` exported but used for sensitive events in monitoringService, integrityService, alertService
- Must change: add `emitToFolderOwner(folderId, folderOwnerId, event, data)` helper; add folder access check in `subscribe:monitoring` handler

**`server/src/services/monitoringService.js`**
- Currently: `activeWatchers` is `Map<folderId, watcher>`
- Must change: store `{ watcher, folderOwnerId }` per entry; replace all sensitive `emitToAll` with `emitToFolderOwner`
- Pause semantics: currently `watcher.unwatch('**/*')` — must be `watcher.close()` + remove from map
- Resume semantics: currently calls `stopMonitoring` first — must call `startMonitoring` directly (watcher already closed)

**`server/src/services/integrityService.js`**
- Replace `emitToAll` for file events with `emitToFolderOwner(folder._id, folder.createdBy, event, data)`
- Pass `createdBy: folder.createdBy` to `createAlert()`

**`server/src/services/alertService.js`**
- Replace `emitToAll('alert:new', ...)` with `emitToFolderOwner` when `folderId`+`createdBy` available; else `emitToAdmins`

**`server/src/services/schedulerService.js`** *(NEW)*
- `scheduleFolder(folder)`: sets interval for auto-scan
- `unscheduleFolder(folderId)`: clears interval
- `initScheduler()`: loads all `autoScan:true` folders from DB, schedules each

**`server/src/services/recoveryService.js`** *(NEW)*
- `recoverMonitoring()`: loads all `monitoringEnabled:true` folders, calls `startMonitoring` for each

**`server/src/app.js`**
- Add `async startServer()` wrapping everything; order: validateEnv → ensureDirs → connectDB → initSocket → initScheduler → recoverMonitoring → listen

---

- [ ] 25. **Add emitToFolderOwner + authorize subscribe:monitoring in socketManager**
       New helper emits to `user:{ownerId}` + `admin`. Subscribe handler checks folder ownership via DB lookup.
       Files: `server/src/websocket/socketManager.js`
       Verify: `node -e "const s=require('./src/websocket/socketManager'); console.log(typeof s.emitToFolderOwner)"` → `function`

- [ ] 26. **Replace sensitive emitToAll in monitoringService + fix pause/resume/stop semantics**
       Store `{ watcher, folderOwnerId }` in map. Replace file/integrity emits. Fix pause (close + monitoringEnabled=true), stop (close + monitoringEnabled=false), resume (startMonitoring directly).
       Files: `server/src/services/monitoringService.js`
       Verify: `node -e "const src=require('fs').readFileSync('./src/services/monitoringService.js','utf8'); const n=(src.match(/emitToAll\\(/g)||[]).length; console.log('emitToAll count:', n, '(should be 0 for sensitive events, monitoring:* ok)')"` 

- [ ] 27. **Replace sensitive emitToAll in integrityService**
       Use `emitToFolderOwner` for file/scan events; pass `createdBy` to `createAlert`.
       Files: `server/src/services/integrityService.js`
       Verify: server starts without crash

- [ ] 28. **Replace emitToAll in alertService**
       Use `emitToFolderOwner` or `emitToAdmins` for `alert:new`.
       Files: `server/src/services/alertService.js`
       Verify: server starts without crash

- [ ] 29. **Create schedulerService**
       Map-based interval scheduler; `initScheduler()` loads autoScan folders from DB.
       Files: `server/src/services/schedulerService.js` *(new)*
       Verify: `node -e "const s=require('./src/services/schedulerService'); console.log(typeof s.initScheduler, typeof s.scheduleFolder, typeof s.unscheduleFolder)"` → `function function function`

- [ ] 30. **Create recoveryService**
       `recoverMonitoring()` re-attaches watchers for `monitoringEnabled:true` folders.
       Files: `server/src/services/recoveryService.js` *(new)*
       Verify: `node -e "const r=require('./src/services/recoveryService'); console.log(typeof r.recoverMonitoring)"` → `function`

- [ ] 31. **Restructure app.js into async startServer() with validated startup order**
       Order: validateEnv (JWT_SECRET length >= 32; warn dev / exit prod) → ensureDirs → connectDB → initSocket → initScheduler → recoverMonitoring → listen.
       Files: `server/src/app.js`
       Verify: `cd server && node src/app.js` — starts cleanly, no crash (then Ctrl+C)

---

## FEAT-005 — Upload Security, Environment Config, Tests, .gitignore, Frontend

### What currently exists and what must change

**`server/src/app.js`**
- Currently: `app.use('/uploads', express.static(config.upload.dir))` — unauthenticated file access
- Must change: remove that line; add authenticated `GET /api/files/:id/download` endpoint

**`server/src/routes/files.js`**
- Add `GET /:id/download` — `protect`, ownership check, stream `uploadedPath` via `res.sendFile()`

**`server/src/config/database.js`**
- Currently: always falls back to mongodb-memory-server on any connection failure
- Must change: fall back ONLY when `process.env.USE_MEMORY_DB === 'true'`; otherwise `process.exit(1)`

**`client/src/services/api.js`**
- Currently: `baseURL: '/api'` hardcoded
- Must change: `baseURL: import.meta.env.VITE_API_URL || '/api'`

**`client/src/services/socket.js`**
- Currently: `io('http://localhost:5000', ...)` hardcoded
- Must change: `io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', ...)`

**`client/src/pages/RegisterPage.jsx`**
- Currently: form sends `{ name, email, password }` — no role field ✓ (already clean)
- Must change: add a comment confirming analyst-only; no code change needed

**`client/.env.example`** *(NEW)*
- `VITE_API_URL=http://localhost:5000/api`
- `VITE_SOCKET_URL=http://localhost:5000`

**`.gitignore`**
- Add: `server/.env`, `client/.env`, `client/.env.local`, `*.pem`, `*.key`, `.agents/`

**`server/package.json`**
- Add `testTimeout: 30000` to `jest` config block

**`server/__tests__/hash.test.js`** *(NEW)*
- Tests: `calculateFileHash`, `calculateBufferHash`, `compareHashes`, `validatePath`

**`server/__tests__/signature.test.js`** *(NEW)*
- Tests: `generateKeyPair`, `signBuffer`+`verifyBufferSignature` round-trip, tampered data fails

**`server/__tests__/auth.test.js`** *(NEW)*
- Tests: public registration always creates analyst, first-user admin, duplicate email 409, login success/failure
- Uses: supertest + mongodb-memory-server (already a dependency)

---

- [ ] 32. **Remove static uploads serving; add authenticated download endpoint**
       Remove `app.use('/uploads', express.static(...))` from app.js. Add `GET /:id/download` in files.js route + handler in fileController.
       Files: `server/src/app.js`, `server/src/routes/files.js`, `server/src/controllers/fileController.js`
       Also remove `/uploads` proxy from `client/vite.config.js`
       Verify: `node -e "const src=require('fs').readFileSync('./src/app.js','utf8'); console.log('No static uploads:', !src.includes('static(config.upload'))"` → `No static uploads: true`

- [ ] 33. **Fix database.js — memory fallback behind USE_MEMORY_DB flag**
       Only enter memory server branch when `process.env.USE_MEMORY_DB === 'true'`; else exit(1) on failure.
       Files: `server/src/config/database.js`
       Verify: `node -e "const src=require('fs').readFileSync('./src/config/database.js','utf8'); console.log('Has USE_MEMORY_DB guard:', src.includes('USE_MEMORY_DB'))"` → true

- [ ] 34. **Create client/.env.example; update api.js and socket.js to use env vars**
       `api.js`: `baseURL: import.meta.env.VITE_API_URL || '/api'`
       `socket.js`: use `VITE_SOCKET_URL || 'http://localhost:5000'`
       Files: `client/.env.example` *(new)*, `client/src/services/api.js`, `client/src/services/socket.js`
       Verify: `node -e "const src=require('fs').readFileSync('./src/services/socket.js','utf8'); console.log('Uses VITE_SOCKET_URL:', src.includes('VITE_SOCKET_URL'))"` (run in client/)

- [ ] 35. **Update .gitignore and .env.example**
       Add `server/.env`, `client/.env`, `client/.env.local`, `*.pem`, `*.key`, `.agents/` to root `.gitignore`.
       Update root `.env.example` with `USE_MEMORY_DB=false` entry.
       Files: `.gitignore`, `.env.example`
       Verify: `Get-Content .gitignore | Select-String "agents"` → matches

- [ ] 36. **Add testTimeout to server/package.json jest config**
       Files: `server/package.json`
       Verify: `node -e "const p=require('./package.json'); console.log('testTimeout:', p.jest.testTimeout)"` → `testTimeout: 30000`

- [ ] 37. **Create server/__tests__/hash.test.js**
       Full content (see below). Tests: file hash, buffer hash, compareHashes (true/false cases), validatePath.
       Files: `server/__tests__/hash.test.js` *(new)*
       Verify: `cd server && npm test -- --testPathPattern=hash --forceExit` → all tests pass

- [ ] 38. **Create server/__tests__/signature.test.js**
       Full content (see below). Tests: key gen, sign+verify round-trip, tampered data, wrong key.
       Files: `server/__tests__/signature.test.js` *(new)*
       Verify: `cd server && npm test -- --testPathPattern=signature --forceExit` → all tests pass

- [ ] 39. **Create server/__tests__/auth.test.js**
       Full content (see below). Tests: analyst role enforcement, first-user admin, duplicate email, login.
       Files: `server/__tests__/auth.test.js` *(new)*
       Verify: `cd server && npm test -- --forceExit` → all tests in all three files pass

---

## Full Test File Contents

### `server/__tests__/hash.test.js`

```javascript
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { calculateFileHash, calculateBufferHash, compareHashes, validatePath } = require('../src/services/hashService');

let tmpFile;

beforeAll(async () => {
  tmpFile = path.join(os.tmpdir(), `hash-test-${Date.now()}.txt`);
  await fsp.writeFile(tmpFile, 'Hello, SHA-256!', 'utf8');
});

afterAll(async () => {
  await fsp.unlink(tmpFile).catch(() => {});
});

describe('calculateFileHash', () => {
  test('produces correct SHA-256 for known content', async () => {
    const hash = await calculateFileHash(tmpFile);
    // SHA-256 of 'Hello, SHA-256!'
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(calculateBufferHash(Buffer.from('Hello, SHA-256!', 'utf8')));
  });

  test('throws on missing file', async () => {
    await expect(calculateFileHash('/nonexistent/path/file.txt')).rejects.toThrow();
  });
});

describe('calculateBufferHash', () => {
  test('produces consistent hex string', () => {
    const h1 = calculateBufferHash(Buffer.from('test'));
    const h2 = calculateBufferHash(Buffer.from('test'));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  test('different inputs produce different hashes', () => {
    const h1 = calculateBufferHash(Buffer.from('aaa'));
    const h2 = calculateBufferHash(Buffer.from('bbb'));
    expect(h1).not.toBe(h2);
  });
});

describe('compareHashes', () => {
  test('identical hashes return true', () => {
    const h = calculateBufferHash(Buffer.from('data'));
    expect(compareHashes(h, h)).toBe(true);
  });

  test('different hashes return false', () => {
    const h1 = calculateBufferHash(Buffer.from('a'));
    const h2 = calculateBufferHash(Buffer.from('b'));
    expect(compareHashes(h1, h2)).toBe(false);
  });

  test('null inputs return false', () => {
    expect(compareHashes(null, null)).toBe(false);
    expect(compareHashes('abc', null)).toBe(false);
  });

  test('different length inputs return false', () => {
    expect(compareHashes('abc', 'abcd')).toBe(false);
  });
});

describe('validatePath', () => {
  const root = path.join(os.tmpdir(), 'monitor-root');

  test('path within root is valid', () => {
    expect(validatePath(path.join(root, 'subdir', 'file.txt'), root)).toBe(true);
  });

  test('root itself is valid', () => {
    expect(validatePath(root, root)).toBe(true);
  });

  test('path outside root is invalid', () => {
    expect(validatePath(path.join(root, '..', '..', 'etc', 'passwd'), root)).toBe(false);
  });

  test('path traversal attempt is blocked', () => {
    expect(validatePath(path.join(root, 'a', '..', '..', '..', 'secret'), root)).toBe(false);
  });
});
```

### `server/__tests__/signature.test.js`

```javascript
const { generateKeyPair, signBuffer, verifyBufferSignature, signHash, verifySignature } = require('../src/services/signatureService');

let publicKey, privateKey;

beforeAll(async () => {
  const kp = await generateKeyPair();
  publicKey = kp.publicKey;
  privateKey = kp.privateKey;
}, 30000);

describe('generateKeyPair', () => {
  test('returns PEM-encoded public and private keys', () => {
    expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----');
    expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----');
  });
});

describe('signBuffer + verifyBufferSignature', () => {
  test('sign and verify round-trip succeeds', () => {
    const buf = Buffer.from('integrity test content');
    const { fileHash, signature } = signBuffer(buf, privateKey);
    expect(fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(signature).toBeTruthy();
    expect(verifyBufferSignature(buf, signature, publicKey)).toBe(true);
  });

  test('tampered buffer fails verification', () => {
    const buf = Buffer.from('original content');
    const { signature } = signBuffer(buf, privateKey);
    const tampered = Buffer.from('tampered content');
    expect(verifyBufferSignature(tampered, signature, publicKey)).toBe(false);
  });

  test('wrong public key fails verification', async () => {
    const buf = Buffer.from('test data');
    const { signature } = signBuffer(buf, privateKey);
    const { publicKey: wrongPub } = await generateKeyPair();
    expect(verifyBufferSignature(buf, signature, wrongPub)).toBe(false);
  });
});

describe('signHash + verifySignature', () => {
  test('sign hash and verify succeeds', () => {
    const hash = 'a'.repeat(64); // 64-char hex-like string
    const sig = signHash(hash, privateKey);
    expect(verifySignature(hash, sig, publicKey)).toBe(true);
  });

  test('tampered hash fails', () => {
    const hash = 'a'.repeat(64);
    const sig = signHash(hash, privateKey);
    const tampered = 'b'.repeat(64);
    expect(verifySignature(tampered, sig, publicKey)).toBe(false);
  });
});
```

### `server/__tests__/auth.test.js`

```javascript
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
  process.env.NODE_ENV = 'test';
  // Require app AFTER setting env vars
  ({ app } = require('../src/app'));
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('POST /api/auth/register', () => {
  test('first user becomes admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Admin User', email: 'admin@test.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });

  test('subsequent users always become analysts regardless of role in body', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Analyst User', email: 'analyst@test.com', password: 'password123', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('analyst');
  });

  test('duplicate email returns 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup User', email: 'analyst@test.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('missing fields return 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@test.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('valid credentials return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('admin@test.com');
  });

  test('wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('unknown email returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});
```

---

## Risks and Compatibility Concerns

1. **MongoDB field rename (sha256 → baselineSha256/currentSha256)**: Any existing documents in a real deployment will have `sha256` but not the new fields. The model change requires a migration script or the server will fail `required` validation when trying to save. For this project the dev uses in-memory or local MongoDB — wipe and re-baseline is acceptable. A note should be added to README.

2. **signatureService algorithm change (SHA256 → RSA-SHA256)**: Existing `DigitalSignature` records in the DB signed with the old algorithm will fail re-verification. This is unavoidable — new signatures will be correct.

3. **KeyPair model replaces in-memory Map**: Any keys generated in a prior session are lost (they were in-memory anyway). After this change, keys survive restarts.

4. **database.js memory fallback gating**: If a developer has `USE_MEMORY_DB` not set and MongoDB is down, the server will now exit instead of silently using volatile storage. This is the correct secure behavior. Dev setup instructions must be updated.

5. **emitToAll replacement**: The frontend `RealtimeMonitorPage` and `AlertsPage` listen on `file:modified`, `file:deleted`, `file:created`, `alert:new` via socket. After this change, analysts will only receive events for their own folders — this is correct. Admin users will still receive all events via the `admin` room.

6. **versionController FileVersion.sha256**: FileVersion still has a `sha256` field (snapshot of that version). This is intentional — each version records what the hash was at that point in time. This is NOT the MonitoredFile.sha256 and must NOT be renamed.

7. **Auth test isolation**: `auth.test.js` sets `MONGODB_URI` in `process.env` before requiring `app`. Jest runs each test file in its own worker so this is safe. However, `app.js` calls `httpServer.listen()` at startup which may conflict between test runs — the test should check if the server starts or just use `app` with supertest without listening. The `app.js` exports `{ app, httpServer }` — supertest can use `app` directly without listening.
