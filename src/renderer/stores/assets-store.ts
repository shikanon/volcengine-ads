import { create } from 'zustand';

import { api } from '../ipc.js';
import type { AssetRecord } from '../../shared/types.js';

interface AssetsState {
  assets: AssetRecord[];
  loadAssets(): Promise<void>;
  reveal(path: string): Promise<void>;
}

export const useAssetsStore = create<AssetsState>((set) => ({
  assets: [],
  async loadAssets() {
    set({ assets: await api.asset.list() });
  },
  async reveal(path) {
    await api.asset.reveal({ path });
  },
}));
