import { wrap } from 'comlink';

import { http as core } from './core';

import type { HTTP } from './core';

/**
 * Duck-types Vue 3's reactive Proxy marker instead of importing `vue` as a hard
 * dependency. Vue exposes this same check publicly as `toRaw()`; reading the
 * `__v_raw` marker directly gets identical behavior without requiring
 * consumers who aren't using Vue to install it.
 */
const unwrapReactive = <T>(value: T): T => {
  const raw = (value as { __v_raw?: T })?.__v_raw;
  return raw !== undefined ? raw : value;
};

/**
 * Normalizes a value so it is safely transferable via `postMessage`'s
 * structured clone algorithm: strips reactive Proxy wrappers (Vue, and
 * anything else that follows the same `__v_raw` convention) and converts
 * `Headers` instances to plain objects.
 */
const toCloneable = <T>(value: T): T => {
  if (value === null || value === undefined || typeof value !== 'object') return value;

  const raw = unwrapReactive(value as object) as T;

  // FileList: not structured-cloneable; passed through (the worker handles it via FormData)
  // Uses __proto__ pattern to match core.ts's FileList detection for JSDOM compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((raw as any)?.__proto__?.[Symbol.toStringTag] === 'FileList') return raw;

  // Headers: never structured-cloneable; convert to plain Record<string, string>
  if (raw instanceof Headers) {
    return Object.fromEntries((raw as Headers).entries()) as unknown as T;
  }

  // Structured-cloneable built-ins: pass through without modification
  if (
    raw instanceof Date ||
    raw instanceof RegExp ||
    raw instanceof ArrayBuffer ||
    ArrayBuffer.isView(raw)
  ) {
    return raw;
  }

  // Array: recursively normalize each element
  if (Array.isArray(raw)) {
    return (raw as unknown[]).map(toCloneable) as unknown as T;
  }

  // Plain object: copy own enumerable keys, recursively normalizing values
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(raw as object)) {
    result[key] = toCloneable((raw as Record<string, unknown>)[key]);
  }
  return result as unknown as T;
};

const createWorkerClient = (): HTTP.Operator => {
  // `new URL('./worker.js', import.meta.url)` is the portable worker-bundling
  // pattern understood by Vite, Webpack 5+, and native ESM — no bundler-specific
  // import syntax (e.g. Vite's `?worker`) required.
  const worker = wrap<HTTP.Operator>(
    new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  return {
    // request() has overloaded signatures; method (index 0) and url (index 1)
    // are strings and don't need normalization.
    request: ((...args: [string, string, ...unknown[]]) =>
      worker.request(
        args[0],
        args[1],
        ...args.slice(2).map(toCloneable)
      )) as unknown as HTTP.Operator['request'],
    head: (url: string, options?: HTTP.Options<boolean>) => worker.head(url, toCloneable(options)),
    get: (url: string, options?: HTTP.Options<boolean>) => worker.get(url, toCloneable(options)),
    post: (url: string, body: unknown, options?: HTTP.Options<boolean>) =>
      worker.post(url, toCloneable(body), toCloneable(options)),
    put: (url: string, body: unknown, options?: HTTP.Options<boolean>) =>
      worker.put(url, toCloneable(body), toCloneable(options)),
    delete: (url: string, options?: HTTP.Options<boolean>) =>
      worker.delete(url, toCloneable(options)),
    patch: (url: string, body: unknown, options?: HTTP.Options<boolean>) =>
      worker.patch(url, toCloneable(body), toCloneable(options))
  } as unknown as HTTP.Operator;
};

/**
 * The environment-aware HTTP client.
 *
 * In any environment with a `Worker` global (browsers), requests are
 * transparently offloaded to a Web Worker via comlink. In environments without
 * one (Node, SSR), it falls back to calling `fetch` directly on the current
 * thread — same API either way.
 */
const http: HTTP.Operator = typeof Worker === 'undefined' ? core : createWorkerClient();

export default http;
export { core, toCloneable };
export type { HTTP };
