import type { AppApi } from '../preload/index.js';

declare global {
  interface Window {
    api?: AppApi;
  }
}

function resolveApi(): AppApi {
  if (window.api) {
    return window.api;
  }
  throw new Error('Electron preload is unavailable. Settings cannot be saved without window.api.');
}

export const api = resolveApi();
