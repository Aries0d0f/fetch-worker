# fetch-worker

[![CI](https://github.com/aries0d0f/fetch-worker/actions/workflows/ci.yml/badge.svg)](https://github.com/aries0d0f/fetch-worker/actions/workflows/ci.yml)
[![GitHub Packages](https://img.shields.io/badge/package-GitHub%20Packages-blue?logo=github)](https://github.com/aries0d0f/fetch-worker/pkgs/npm/fetch-worker)
[![license](https://img.shields.io/github/license/aries0d0f/fetch-worker.svg)](./LICENSE)

An axios-style HTTP client built entirely on native `fetch` — with requests run
on a dedicated Web Worker thread, in parallel with your main thread, via
[comlink](https://github.com/GoogleChromeLabs/comlink). TypeScript-first from
the ground up: every method, response, and error shape is fully typed and
generic over your payloads.

- **Axios-style ergonomics, zero axios** — `http.get/post/put/patch/delete`,
  typed generics, structured error rejections, and abortable requests — all on
  top of the platform's own `fetch`, with no polyfills or XHR fallback.
- **Runs in parallel with your app** — request/response handling, JSON/YAML
  parsing, and error normalization all happen on a separate Web Worker thread,
  so they proceed alongside your main thread instead of contending with
  rendering and user input for the same event loop.
- **TypeScript-first** — request bodies, response payloads, and error shapes
  are generic and inferred end-to-end; there's no `any` in the public API.
- **Same API everywhere** — the client detects its environment at import time.
  In a browser it spins up a worker automatically; in Node or during SSR
  (no `Worker` global) it calls `fetch` directly on the current thread instead.
- **No bundler lock-in** — the worker is loaded via the portable
  `new URL('./worker.js', import.meta.url)` pattern, which Vite, Webpack 5+,
  and native ESM all understand. No `?worker` suffix or plugin required.
- **Small surface area** — two real dependencies: `comlink` (the worker RPC
  transport) and `js-yaml` (for the `.yaml()` response helper).

## Install

This package is published to [GitHub Packages](https://github.com/aries0d0f/fetch-worker/pkgs/npm/fetch-worker),
not npmjs.org. GitHub Packages requires authentication to install from, even
for public packages, so point your package manager at the registry with a
token that has `read:packages` scope first.

Add to `.npmrc` in your project (or `~/.npmrc` globally):

```ini
@aries0d0f:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install as usual:

```sh
bun add @aries0d0f/fetch-worker
# or: npm install @aries0d0f/fetch-worker / pnpm add @aries0d0f/fetch-worker
```

## Usage

```ts
import http from '@aries0d0f/fetch-worker';

const res = await http.get<{ id: number; name: string }>('/api/users/1');
const user = await res.json();

await http.post('/api/users', { name: 'Ada' });
```

### Aborting a request

Pass `controllable: true` to get back the in-flight request alongside its
`AbortController`:

```ts
const { request, controller } = await http.get('/api/slow', { controllable: true });

setTimeout(() => controller.abort(), 1000);

const res = await request;
```

### Response helpers

Every response exposes the usual `fetch` `Response` members (`status`, `ok`,
`text()`, `blob()`, `arrayBuffer()`, ...) plus:

- `res.json<T>()` — parse the body as JSON
- `res.yaml<T>()` — parse the body as YAML
- `res.headers` — a `Headers`-like object whose accessors (`get`, `has`,
  `entries`, `keys`, `values`) return Promises, since `Headers` instances
  themselves can't cross the worker boundary

### Error handling

A non-2xx response rejects with a plain object rather than throwing:

```ts
try {
  await http.get('/api/missing');
} catch (err) {
  // err: { ok, status, statusText, url, headers, error: { title, status, detail } }
}
```

### Skipping the worker

Import the core client directly to always run on the current thread (useful
in tests, or when you deliberately don't want a worker):

```ts
import { http } from '@aries0d0f/fetch-worker/core';
```

### Framework-reactive values

If you pass a reactive object (e.g. a Vue `ref`/`reactive` value) as a request
body or options, it's unwrapped to its plain, cloneable form before being sent
across the worker boundary — no extra step required on your end.

## API

| Method                            | Signature                                      |
| --------------------------------- | ---------------------------------------------- |
| `http.get(url, options?)`         | `GET` request                                  |
| `http.head(url, options?)`        | `HEAD` request                                 |
| `http.post(url, body, options?)`  | `POST` request                                 |
| `http.put(url, body, options?)`   | `PUT` request                                  |
| `http.patch(url, body, options?)` | `PATCH` request                                |
| `http.delete(url, options?)`      | `DELETE` request                               |
| `http.request(method, url, ...)`  | Low-level entry point used by all of the above |

`options` extends `RequestInit` (minus `headers`/`body`/`signal`, which are
handled specially) with one addition: `controllable?: boolean`.

## Why a worker?

Parsing large JSON/YAML payloads, and the general bookkeeping `fetch` does
around headers/body streams, all run on whichever thread calls it. Moving that
work onto a dedicated worker thread lets it run in parallel with your main
thread instead of on it — keeping the main thread free for rendering and user
input, particularly useful in UI-heavy apps making frequent or large requests.

## Development

```sh
bun install
bun run build       # bundle with tsup (ESM output + .d.ts)
bun run test        # vitest + msw
bun run lint         # eslint
bun run typecheck    # tsc --noEmit
```

This repo uses [Changesets](https://github.com/changesets/changesets) for
versioning. Run `bun run changeset` alongside your PR to describe the change;
CI opens a "Version Packages" PR and publishes to GitHub Packages on merge.

## License

[MIT](./LICENSE)
