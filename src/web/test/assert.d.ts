// The web tests bundle the `assert` polyfill, which ships no typings.
// Node typings are not loaded in the web build, so declare the subset in use here.
declare module 'assert' {
	export function ok(value: unknown, message?: string): asserts value;
	export function strictEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
	export function notStrictEqual(actual: unknown, expected: unknown, message?: string): void;
	export function deepStrictEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
}
