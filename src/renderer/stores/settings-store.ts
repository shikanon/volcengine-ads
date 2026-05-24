import { create } from 'zustand';

import { api } from '../ipc.js';
import type { SettingsState, SettingsUpdate } from '../../shared/types.js';

interface SettingsStore {
  settings?: SettingsState;
  loadSettings(): Promise<void>;
  saveSettings(update: SettingsUpdate): Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  async loadSettings() {
    set({ settings: await api.settings.get() });
  },
  async saveSettings(update) {
    set({ settings: await api.settings.set(update) });
  },
}));
