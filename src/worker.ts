/// <reference lib="webworker" />

import { expose } from 'comlink';

import { http } from './core';

const self: WorkerGlobalScope & typeof globalThis = globalThis as any;

expose(http, self);

export default null;
