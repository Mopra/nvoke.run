import type { NvokeApi } from '../ipc/contract';

declare global {
  interface Window {
    nvoke: NvokeApi;
  }
}

export {};
