/**
 * Replacement for `jest.mock("axios")`.
 *
 * Jest gave each test file its own module registry, so `jest.mock("axios")`
 * was file-local and its automock produced a fresh `axios.get` per file.
 * `bun test` runs the whole suite in one module graph and `mock.module()` is
 * global from the moment it runs, so the two files that stub axios
 * (BooksRoute and ImportRoute) share this one registration instead of
 * fighting over it. Each still owns its own behaviour by calling
 * `mockedAxiosGet.mockReset()` in its `beforeEach`, exactly as before.
 *
 * `isAxiosError` is a bare `mock()` returning `undefined` on purpose: that is
 * what Jest's automock did with it, so the error branches in BooksRoute.ts
 * behave under bun exactly as the assertions were written against.
 */
import {mock} from "bun:test";

export const mockedAxiosGet = mock();

const axiosStub = {
    get: mockedAxiosGet,
    isAxiosError: mock(),
};

mock.module("axios", () => ({...axiosStub, default: axiosStub}));
