<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Caching architecture

There is no IndexedDB, localStorage mirror, or offline-sync engine anywhere
in this app. MongoDB (via the Next.js API routes) is always the source of
truth. Client-side data stores under `lib/store/` (`projects.ts`,
`pdf-projects.ts`, `booking-templates.ts`) follow one consistent pattern:

- `lib/store/fetch-with-auth.ts` — shared authenticated `fetch` wrapper.
- `lib/store/cache.ts` — `createResourceCache<T>(ttlMs)`, a small generic
  in-memory (Map-based) cache with a TTL'd list cache + per-id item cache.
  This is the single caching mechanism reused by every store — don't
  reintroduce IndexedDB, localStorage, or a bespoke cache per store.
- Cached values are stored in the exact same shape as the API/DB response
  (no reshaping). Cache is invalidated on create/update/delete and cleared
  on full page reload — it only avoids redundant requests within a session.
- The editor/pdf-tool pages keep in-progress edits in React state (and
  sessionStorage only for crash recovery); they write to the DB only on
  explicit Save or the leave-modal "Yes" action.

## Follow-up needed after this refactor

`npm install` could not be run in this sandbox (the shell tool crashed with
an `Internal CLR error` on every invocation). `package.json` had the now-
unused `idb` dependency removed, but `package-lock.json` and `node_modules`
still reference it. Run `npm install` locally to sync the lockfile, then
run `npm run build` / `npm run lint` to verify the refactor end-to-end.
