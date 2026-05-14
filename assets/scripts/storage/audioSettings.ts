import { storageGetItem, storageSetItem } from './platformKv';

const KEY = 'cat-game-audio-v1';

export type AudioSettingsV1 = {
  version: 1;
  bgmEnabled: boolean;
  sfxEnabled: boolean;
};

const defaultSettings = (): AudioSettingsV1 => ({
  version: 1,
  bgmEnabled: true,
  sfxEnabled: true,
});

export function loadAudioSettings(): AudioSettingsV1 {
  try {
    const raw = storageGetItem(KEY);
    if (!raw) return defaultSettings();
    const o = JSON.parse(raw) as Partial<AudioSettingsV1>;
    if (o.version !== 1) return defaultSettings();
    return {
      version: 1,
      bgmEnabled: o.bgmEnabled !== false,
      sfxEnabled: o.sfxEnabled !== false,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveAudioSettings(s: AudioSettingsV1): void {
  try {
    storageSetItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
