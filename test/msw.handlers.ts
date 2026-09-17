import { HttpResponse, http as mock } from 'msw';

export const handlers = [
  mock.get('https://api.test/json', () => HttpResponse.json({ hello: 'world' })),

  mock.get('https://api.test/yaml', () =>
    HttpResponse.text('hello: world\ncount: 2\n', {
      headers: { 'Content-Type': 'application/yaml' }
    })
  ),

  mock.get('https://api.test/text', () => HttpResponse.text('plain text body')),

  mock.get('https://api.test/echo-headers', ({ request }) =>
    HttpResponse.json(Object.fromEntries(request.headers.entries()))
  ),

  mock.head('https://api.test/head', () => new HttpResponse(null, { status: 200 })),

  mock.post('https://api.test/echo', async ({ request }) =>
    HttpResponse.json(await request.json())
  ),

  mock.post('https://api.test/upload', async ({ request }) => {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    return HttpResponse.json({ name: file?.name ?? null, fields: [...form.keys()] });
  }),

  mock.put('https://api.test/echo', async ({ request }) => HttpResponse.json(await request.json())),

  mock.patch('https://api.test/echo', async ({ request }) =>
    HttpResponse.json(await request.json())
  ),

  mock.delete('https://api.test/thing/1', () => new HttpResponse(null, { status: 204 })),

  mock.get('https://api.test/not-found', () =>
    HttpResponse.json(
      {
        type: 'https://example.com/probs/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'missing'
      },
      { status: 404, headers: { 'Content-Type': 'application/problem+json' } }
    )
  ),

  mock.get('https://api.test/json-error', () =>
    HttpResponse.json({ message: 'nope' }, { status: 400 })
  ),

  mock.get('https://api.test/bad-error-body', () => new HttpResponse('oops', { status: 500 })),

  mock.get('https://api.test/slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return HttpResponse.json({ done: true });
  }),

  mock.get(
    'https://api.test/malformed-problem',
    () =>
      new HttpResponse('not json', {
        status: 422,
        headers: { 'Content-Type': 'application/problem+json' }
      })
  ),

  mock.get(
    'https://api.test/binary',
    () =>
      new HttpResponse(new Uint8Array([1, 2, 3]).buffer, {
        headers: { 'Content-Type': 'application/octet-stream' }
      })
  ),

  mock.get('https://api.test/form-data-response', () => {
    const form = new FormData();
    form.append('key', 'value');
    return HttpResponse.formData(form);
  }),

  mock.post('https://api.test/echo-raw', async ({ request }) =>
    HttpResponse.text(await request.text())
  )
];
