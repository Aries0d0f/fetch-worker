import { describe, expect, it } from 'vitest';

import { http } from '../src/core';

describe('http.get', () => {
  it('parses a JSON response body', async () => {
    const res = await http.get<{ hello: string }>('https://api.test/json');
    await expect(res.json()).resolves.toEqual({ hello: 'world' });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('parses a YAML response body', async () => {
    const res = await http.get<{ hello: string; count: number }>('https://api.test/yaml');
    await expect(res.yaml()).resolves.toEqual({ hello: 'world', count: 2 });
  });

  it('exposes the raw text body', async () => {
    const res = await http.get('https://api.test/text');
    await expect(res.text()).resolves.toBe('plain text body');
  });

  it('exposes response headers via the SerializableHeaders shim', async () => {
    const res = await http.get<Record<string, string>>('https://api.test/echo-headers', {
      headers: { 'X-Custom': 'value' }
    });
    const body = await res.json();
    expect(body['x-custom']).toBe('value');

    await expect(res.headers.get('content-type')).resolves.toContain('application/json');
    await expect(res.headers.has('content-type')).resolves.toBe(true);
    await expect(res.headers.has('nope')).resolves.toBe(false);
  });

  it('sends default JSON content-type headers', async () => {
    const res = await http.get<Record<string, string>>('https://api.test/echo-headers');
    const body = await res.json();
    expect(body['content-type']).toBe('application/json');
  });

  it('rejects with an RFC 9457 problem for an application/problem+json error body', async () => {
    await expect(http.get('https://api.test/not-found')).rejects.toMatchObject({
      ok: false,
      status: 404,
      error: {
        type: 'https://example.com/probs/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'missing'
      }
    });
  });

  it('rejects with the raw response text for a plain JSON error body', async () => {
    await expect(http.get('https://api.test/json-error')).rejects.toMatchObject({
      ok: false,
      status: 400,
      error: JSON.stringify({ message: 'nope' })
    });
  });

  it('rejects with the raw response text for a non-JSON error body', async () => {
    await expect(http.get('https://api.test/bad-error-body')).rejects.toMatchObject({
      ok: false,
      status: 500,
      error: 'oops'
    });
  });

  it('returns an abort controller and does not resolve the request eagerly when controllable', async () => {
    const { request, controller } = await http.get('https://api.test/slow', {
      controllable: true
    });
    expect(controller).toBeInstanceOf(AbortController);
    controller.abort();
    await expect(request).rejects.toBeDefined();
  });
});

describe('http.head', () => {
  it('issues a HEAD request with no body', async () => {
    const res = await http.head('https://api.test/head');
    expect(res.status).toBe(200);
  });
});

describe('http.post / http.put / http.patch', () => {
  it('serializes an object body as JSON and echoes it back', async () => {
    const res = await http.post<{ a: number }, { a: number }>('https://api.test/echo', { a: 1 });
    await expect(res.json()).resolves.toEqual({ a: 1 });
  });

  it('put echoes the JSON body back', async () => {
    const res = await http.put<{ a: number }, { a: number }>('https://api.test/echo', { a: 2 });
    await expect(res.json()).resolves.toEqual({ a: 2 });
  });

  it('patch echoes the JSON body back', async () => {
    const res = await http.patch<{ a: number }, { a: number }>('https://api.test/echo', { a: 3 });
    await expect(res.json()).resolves.toEqual({ a: 3 });
  });

  it('sends a FileList-like body as multipart form data', async () => {
    // Node has no FileList constructor; core.ts detects it via the
    // Symbol.toStringTag prototype marker rather than `instanceof FileList`,
    // so a duck-typed array-like with that marker exercises the same path.
    const file = new File(['contents'], 'note.txt', { type: 'text/plain' });
    const fileList = Object.create(
      { [Symbol.toStringTag]: 'FileList' },
      { length: { value: 1 }, 0: { value: file, enumerable: true } }
    );
    fileList[Symbol.iterator] = Array.prototype[Symbol.iterator];

    const res = await http.post<{ name: string; fields: string[] }, unknown>(
      'https://api.test/upload',
      fileList
    );
    await expect(res.json()).resolves.toEqual({ name: 'note.txt', fields: ['file'] });
  });
});

describe('http.delete', () => {
  it('issues a DELETE request', async () => {
    const res = await http.delete('https://api.test/thing/1');
    expect(res.status).toBe(204);
  });
});
