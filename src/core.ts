/// <reference lib="webworker" />

import { proxy } from 'comlink';
import { load } from 'js-yaml';

type _Response = Response;
type _Error = Error;

/**
 * A structured-clone-safe stand-in for the `Headers` API.
 *
 * `Headers` instances cannot cross a worker `postMessage` boundary, so responses
 * expose this instead. It mirrors the read side of `Headers` (`get`, `has`,
 * `entries`, `keys`, `values`, `forEach`) but every accessor returns a `Promise`
 * so it also works correctly when proxied across a worker via comlink.
 */
class SerializableHeaders {
  private headers: Record<string, string>;

  constructor(headers: Headers | Record<string, string>) {
    if (headers instanceof Headers) {
      this.headers = Object.fromEntries(
        Array.from(headers.entries()).map(([key, value]) => [key.toLowerCase(), value])
      );
    } else {
      this.headers = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
      );
    }
  }

  get(name: string): Promise<string | null> {
    return Promise.resolve(this.headers[name.toLowerCase()] ?? null);
  }

  has(name: string): Promise<boolean> {
    return Promise.resolve(name.toLowerCase() in this.headers);
  }

  entries(): Promise<IterableIterator<[string, string]>> {
    return Promise.resolve(Object.entries(this.headers)[Symbol.iterator]());
  }

  keys(): Promise<IterableIterator<string>> {
    return Promise.resolve(Object.keys(this.headers)[Symbol.iterator]());
  }

  values(): Promise<IterableIterator<string>> {
    return Promise.resolve(Object.values(this.headers)[Symbol.iterator]());
  }

  forEach(callback: (value: string, key: string) => void): void {
    Object.entries(this.headers).forEach(([key, value]) => callback(value, key));
  }
}

export namespace HTTP {
  export type Method = 'HEAD' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  export type Response<T> = Omit<_Response, 'json' | 'headers'> & {
    json(): Promise<T>;
    yaml(): Promise<T>;
    headers: SerializableHeaders;
  };
  export type Operator = typeof http;
  export type Options<Controllable extends boolean> = Omit<
    RequestInit,
    'headers' | 'body' | 'signal'
  > & {
    controllable?: Controllable;
    headers?: HeadersInit;
  };
  export type Payload<Context, Controllable extends boolean> = Controllable extends true
    ? Promise<{
        request: Promise<HTTP.Response<Context>>;
        controller: HTTP.Controller;
      }>
    : Promise<HTTP.Response<Context>>;
  export type Exception = Pick<
    _Response,
    'ok' | 'redirected' | 'status' | 'statusText' | 'type' | 'url'
  > & {
    headers: Record<string, string>;
    error: Error;
  };
  export type Error = {
    title: string;
    status: number;
    detail: string;
    error?: _Error;
  };
  export type Controller = AbortController;
}

const defaultOptions: HTTP.Options<false> = {
  credentials: 'same-origin',
  cache: 'default',
  headers: {
    'Content-Type': 'application/json'
  }
};

const requestHandler: {
  <Context, Controllable extends boolean, Method = Extract<HTTP.Method, 'HEAD' | 'GET' | 'DELETE'>>(
    method: Method,
    url: string,
    ...args: [HTTP.Options<Controllable> | undefined]
  ): HTTP.Payload<Context, Controllable>;
  <
    Context,
    Payload,
    Controllable extends boolean,
    Method = Exclude<HTTP.Method, 'HEAD' | 'GET' | 'DELETE'>
  >(
    method: Method,
    url: string,
    ...args: [Payload, HTTP.Options<Controllable> | undefined]
  ): HTTP.Payload<Context, Controllable>;
} = <Context, Payload, Controllable extends boolean, Method = HTTP.Method>(
  method: HTTP.Method,
  url: string,
  ...args: Method extends 'HEAD' | 'GET' | 'DELETE'
    ? [HTTP.Options<Controllable> | undefined]
    : [Payload, HTTP.Options<Controllable> | undefined]
) => {
  const body = (['HEAD', 'GET', 'DELETE'].includes(method) ? null : args[0]) as Payload;
  const options = (
    ['HEAD', 'GET', 'DELETE'].includes(method) ? args[0] : args[1]
  ) as HTTP.Options<Controllable>;

  const controller = new AbortController();
  const { signal } = controller;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore: FileList is not defined in the global scope
  // ? NOTE: FileList JSDOM type cannot work with MSW request mocker, use workaround to do instance type check via prototype chain
  // ? This is equal to `body instanceof FileList`
  const isFileListBody = body?.__proto__?.[Symbol.toStringTag] === 'FileList';

  const request = fetch(url, {
    method,
    ...(body
      ? {
          body: isFileListBody
            ? [...(body as unknown as FileList)].reduce((payload, file) => {
                payload.append('file', file, `${file.webkitRelativePath || file.name}`);
                return payload;
              }, new FormData())
            : typeof body === 'object'
              ? JSON.stringify(body)
              : String(body)
        }
      : null),
    ...defaultOptions,
    ...options,
    headers: isFileListBody
      ? new Headers(options?.headers)
      : new Headers({ ...defaultOptions.headers, ...options?.headers }),
    signal
  })
    .then(async (res: Omit<HTTP.Response<Context>, 'yaml' | 'headers'> & { headers: Headers }) => {
      if (!res.ok) {
        let error: HTTP.Error;

        try {
          error = await res.clone().json();
        } catch (err) {
          error = {
            title: `${res.status === 401 ? '' : 'Unknown Error: '}${res.statusText}`,
            status: res.status,
            detail: (await res.clone().text()) ?? String(err),
            error: new Error((await res.clone().text()) ?? String(err))
          };
        }

        return Promise.reject({
          ok: res.ok,
          redirected: res.redirected,
          status: res.status,
          statusText: res.statusText,
          type: res.type,
          url: res.url,
          headers: Object.fromEntries(res.headers.entries()),
          error
        } satisfies HTTP.Exception);
      }

      return res.clone();
    })
    .then(async (res: _Response) => {
      const rawBody = await res.clone().text();
      // Create a serializable headers object for cross-worker transfer
      const headers = new SerializableHeaders(res.headers);

      // Return a plain object with response metadata and parsed data
      // Include convenience methods for backward compatibility
      // Use proxy() to ensure methods are callable across worker boundary
      const response: HTTP.Response<Context> = {
        body: res.body,
        clone: res.clone,
        bodyUsed: res.bodyUsed,
        arrayBuffer: () => Promise.resolve(res.arrayBuffer()),
        bytes: () => Promise.resolve(res.bytes()),
        blob: () => Promise.resolve(res.blob()),
        formData: () => Promise.resolve(res.formData()),
        text: () => Promise.resolve(rawBody),
        ok: res.ok,
        redirected: res.redirected,
        status: res.status,
        statusText: res.statusText,
        type: res.type,
        url: res.url,
        headers,
        // Convenience methods that simply return the already-parsed data
        json: async () => Promise.resolve(JSON.parse(rawBody) as Context),
        yaml: async () => Promise.resolve(load(rawBody) as Context)
      };

      return proxy(response);
    });

  return options?.controllable
    ? proxy({ request, controller } as unknown as HTTP.Payload<Context, true>) // Comlink will convert proxied to a Promise
    : (request satisfies HTTP.Payload<Context, false>);
};

/**
 * The core HTTP operator: a thin, typed wrapper around native `fetch`.
 *
 * This module has no worker/comlink transport wiring of its own — it is safe to
 * import directly on the main thread, in Node/SSR, or inside a worker. The
 * worker transport built on top of this lives in `fetch-worker/worker` and the
 * environment-aware client lives in `fetch-worker` (the package root).
 */
export const http = {
  request: requestHandler,
  head: <Context, Controllable extends boolean = false>(
    url: string,
    options?: HTTP.Options<Controllable>
  ) => requestHandler<Context, Controllable, 'HEAD'>('HEAD', url, options),
  get: <Context, Controllable extends boolean = false>(
    url: string,
    options?: HTTP.Options<Controllable>
  ) => requestHandler<Context, Controllable, 'GET'>('GET', url, options),
  post: <Context, Payload, Controllable extends boolean = false>(
    url: string,
    body: Payload,
    options?: HTTP.Options<Controllable>
  ) => requestHandler<Context, Payload, Controllable, 'POST'>('POST', url, body, options),
  put: <Context, Payload, Controllable extends boolean = false>(
    url: string,
    body: Payload,
    options?: HTTP.Options<Controllable>
  ) => requestHandler<Context, Payload, Controllable, 'PUT'>('PUT', url, body, options),
  delete: <Controllable extends boolean = false>(
    url: string,
    options?: HTTP.Options<Controllable>
  ) => requestHandler<void, Controllable, 'DELETE'>('DELETE', url, options),
  patch: <Context, Payload, Controllable extends boolean = false>(
    url: string,
    body: Payload,
    options?: HTTP.Options<Controllable>
  ) => requestHandler<Context, Payload, Controllable, 'PATCH'>('PATCH', url, body, options)
};
