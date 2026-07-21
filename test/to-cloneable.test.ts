import { describe, expect, it } from 'vitest';

import { toCloneable } from '../src/index';

describe('toCloneable', () => {
  it('passes through primitives untouched', () => {
    expect(toCloneable(1)).toBe(1);
    expect(toCloneable('a')).toBe('a');
    expect(toCloneable(null)).toBe(null);
    expect(toCloneable(undefined)).toBe(undefined);
    expect(toCloneable(true)).toBe(true);
  });

  it('unwraps a Vue-style reactive proxy via its __v_raw marker', () => {
    const raw = { a: 1 };
    const reactiveLike = { __v_raw: raw };
    expect(toCloneable(reactiveLike)).toEqual(raw);
  });

  it('converts Headers instances to a plain object', () => {
    const headers = new Headers({ 'X-Test': '1', 'Content-Type': 'application/json' });
    expect(toCloneable(headers)).toEqual({
      'x-test': '1',
      'content-type': 'application/json'
    });
  });

  it('passes through structured-cloneable built-ins unmodified', () => {
    const date = new Date();
    const regex = /abc/;
    const buffer = new ArrayBuffer(4);
    const view = new Uint8Array(buffer);

    expect(toCloneable(date)).toBe(date);
    expect(toCloneable(regex)).toBe(regex);
    expect(toCloneable(buffer)).toBe(buffer);
    expect(toCloneable(view)).toBe(view);
  });

  it('recursively normalizes arrays', () => {
    const headers = new Headers({ a: '1' });
    expect(toCloneable([1, 'x', headers])).toEqual([1, 'x', { a: '1' }]);
  });

  it('recursively normalizes nested plain objects, including nested reactive proxies', () => {
    const inner = { count: 1 };
    const nested = { list: [{ __v_raw: inner }], headers: new Headers({ a: '1' }) };

    expect(toCloneable(nested)).toEqual({
      list: [{ count: 1 }],
      headers: { a: '1' }
    });
  });

  it('leaves a FileList-like value untouched', () => {
    const file = new File(['x'], 'a.txt');
    const fileListLike = Object.create(
      { [Symbol.toStringTag]: 'FileList' },
      { length: { value: 1 }, 0: { value: file, enumerable: true } }
    );

    expect(toCloneable(fileListLike)).toBe(fileListLike);
  });
});
