import { parse } from '@babel/parser';
import { assert, beforeEach, describe, expect, test } from 'vitest';
import { applyTransform } from '../src/index';
import { transforms } from '../src/transforms';

declare module 'vitest' {
  export interface TestContext {
    expectTransform: (actualCode: string, options?: any) => Vi.Assertion<Node>;
    state: { changes: number };
  }
}

beforeEach((context, suite) => {
  const transform = transforms.find(t => t.name === suite.name);
  assert(transform, `Transform ${suite.name} not found`);
  // TODO: type options
  context.expectTransform = (actualCode, options) => {
    const ast = parse(actualCode);
    applyTransform(ast, transform, options);
    return expect(ast);
  };
});

describe('sequence', () => {
  test('to statements', ({ expectTransform }) =>
    expectTransform(`
      if (a) b(), c();
    `).toMatchInlineSnapshot(`
      if (a) {
        b();
        c();
      }
    `));

  test('rearrange from return', ({ expectTransform }) =>
    expectTransform(`
      function f() {
        return a(), b(), c();
      }
    `).toMatchInlineSnapshot(`
      function f() {
        a();
        b();
        return c();
      }
    `));

  test('rearrange from if', ({ expectTransform }) =>
    expectTransform(`
      function f() {
        if (a(), b()) c();
      }
    `).toMatchInlineSnapshot(`
      function f() {
        a();
        if (b()) c();
      }
    `));

  test('rearrange from for-in', ({ expectTransform }) =>
    expectTransform(`
      for (let key in a = 1, object) {}
    `).toMatchInlineSnapshot(`
      a = 1;
      for (let key in object) {}
    `));
});

describe('splitVariableDeclarations', () => {
  test('split variable declaration', ({ expectTransform }) =>
    expectTransform(`
      const a = 1, b = 2, c = 3;
    `).toMatchInlineSnapshot(`
      const a = 1;
      const b = 2;
      const c = 3;
    `));

  test('dont split in for loop', ({ expectTransform }) =>
    expectTransform(`
      for (let i = 0, j = 1; i < 10; i++, j++) var a, b;
    `).toMatchInlineSnapshot(`
      for (let i = 0, j = 1; i < 10; i++, j++) {
        var a;
        var b;
      }
    `));
});

describe('computedProperties', () => {
  test('convert to identifier', ({ expectTransform }) =>
    expectTransform(`
      console["log"]("hello");
    `).toMatchInlineSnapshot('console.log("hello");'));

  test('ignore invalid identifier', ({ expectTransform }) =>
    expectTransform(`
      console["1"]("hello");
    `).toMatchInlineSnapshot('console["1"]("hello");'));
});

describe('extractTernaryCalls', () => {
  test('extract all', ({ expectTransform }) =>
    expectTransform(`
      __DECODE__(100 < o ? 10753 : 5 < o ? 2382 : 2820);
      log(p ? 8590 : 5814);
    `).toMatchInlineSnapshot(
      `
      100 < o ? __DECODE__(10753) : 5 < o ? __DECODE__(2382) : __DECODE__(2820);
      p ? log(8590) : log(5814);
    `
    ));

  test('extract with filter', ({ expectTransform }) =>
    expectTransform(
      `
    __DECODE__(100 < o ? 10753 : 5 < o ? 2382 : 2820);
    log(p ? 8590 : 5814);
    `,
      { callee: '__DECODE__' }
    ).toMatchInlineSnapshot(`
      100 < o ? __DECODE__(10753) : 5 < o ? __DECODE__(2382) : __DECODE__(2820);
      log(p ? 8590 : 5814);
    `));
});

describe('literals', () => {
  test('string', ({ expectTransform }) =>
    expectTransform(`const a = "\\x61"`).toMatchInlineSnapshot(
      'const a = "a";'
    ));

  test('number', ({ expectTransform }) =>
    expectTransform(`const a = 0x1;`).toMatchInlineSnapshot('const a = 1;'));
});

describe('blockStatement', () => {
  test('convert to block statement', ({ expectTransform }) =>
    expectTransform(`
      if (a) b();
      while (a) b();
      for (;;) b();
      for (const key in object) b();
      for (const item of array) b();
    `).toMatchInlineSnapshot(`
      if (a) {
        b();
      }
      while (a) {
        b();
      }
      for (;;) {
        b();
      }
      for (const key in object) {
        b();
      }
      for (const item of array) {
        b();
      }
    `));
});