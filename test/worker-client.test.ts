import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('createWorkerClient (Worker-enabled environment)', () => {
  const workerMock = {
    request: vi.fn(),
    head: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn()
  };

  beforeEach(() => {
    vi.resetModules();
    Object.values(workerMock).forEach((fn) => fn.mockReset());

    vi.doMock('comlink', () => ({ wrap: vi.fn(() => workerMock) }));

    class FakeWorker {
      constructor(_url: URL, _options?: WorkerOptions) {}
    }
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('comlink');
    vi.resetModules();
  });

  it('picks the comlink-wrapped worker client over the direct core operator', async () => {
    const { default: http, core } = await import('../src/index');
    expect(http).not.toBe(core);
  });

  it('normalizes options via toCloneable before forwarding get() to the worker', async () => {
    workerMock.get.mockResolvedValue('get-result');
    const { default: http } = await import('../src/index');

    const result = await http.get('https://api.test/x', {
      headers: new Headers({ 'X-Test': '1' })
    });

    expect(workerMock.get).toHaveBeenCalledWith('https://api.test/x', {
      headers: { 'x-test': '1' }
    });
    expect(result).toBe('get-result');
  });

  it('normalizes body and options for post/put/patch', async () => {
    workerMock.post.mockResolvedValue('post-result');
    workerMock.put.mockResolvedValue('put-result');
    workerMock.patch.mockResolvedValue('patch-result');
    const { default: http } = await import('../src/index');

    const reactiveBody = { __v_raw: { a: 1 } };

    const postResult = await http.post('https://api.test/x', reactiveBody);
    expect(workerMock.post).toHaveBeenCalledWith('https://api.test/x', { a: 1 }, undefined);
    expect(postResult).toBe('post-result');

    await http.put('https://api.test/x', reactiveBody, { headers: new Headers({ b: '2' }) });
    expect(workerMock.put).toHaveBeenCalledWith(
      'https://api.test/x',
      { a: 1 },
      { headers: { b: '2' } }
    );

    await http.patch('https://api.test/x', reactiveBody);
    expect(workerMock.patch).toHaveBeenCalledWith('https://api.test/x', { a: 1 }, undefined);
  });

  it('forwards head() and delete() calls with normalized options', async () => {
    workerMock.head.mockResolvedValue('head-result');
    workerMock.delete.mockResolvedValue('delete-result');
    const { default: http } = await import('../src/index');

    await http.head('https://api.test/x');
    expect(workerMock.head).toHaveBeenCalledWith('https://api.test/x', undefined);

    await http.delete('https://api.test/x', { headers: new Headers({ c: '3' }) });
    expect(workerMock.delete).toHaveBeenCalledWith('https://api.test/x', { headers: { c: '3' } });
  });

  it('forwards request() with method/url passed through untouched and remaining args normalized', async () => {
    workerMock.request.mockResolvedValue('request-result');
    const { default: http } = await import('../src/index');

    const result = await http.request('GET', 'https://api.test/x', {
      headers: new Headers({ d: '4' })
    });

    expect(workerMock.request).toHaveBeenCalledWith('GET', 'https://api.test/x', {
      headers: { d: '4' }
    });
    expect(result).toBe('request-result');
  });
});
