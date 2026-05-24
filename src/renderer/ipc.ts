import type { AppApi } from '../preload/index.js';

declare global {
  interface Window {
    api: AppApi;
  }
}

export const api = window.api;
