import { AudioClip, assetManager, type AssetManager } from 'cc';

/**
 * `assets/skin-pack/kill-audios/<packId>/{1..8}kill.m4a`
 * `packId` 与 `skinConfig.CatSkin.killAudio` 一致（如 `kill-normal`、`kill-feiudui`）。
 */
const KILL_AUDIO_ROOT = 'kill-audios';
const SKIN_PACK_BUNDLE = 'skin-pack';
const KILL_FALLBACK_PACK = 'kill-normal';
export const KILL_AUDIO_COUNT = 8;

let skinPackBundlePromise: Promise<AssetManager.Bundle | null> | null = null;

function loadSkinPackBundle(): Promise<AssetManager.Bundle | null> {
  if (skinPackBundlePromise) return skinPackBundlePromise;
  skinPackBundlePromise = new Promise((resolve) => {
    assetManager.loadBundle(SKIN_PACK_BUNDLE, (err, bundle) => {
      if (err || !bundle) {
        console.warn(`[killAudioLoader] loadBundle '${SKIN_PACK_BUNDLE}' failed`, err);
        resolve(null);
        return;
      }
      resolve(bundle);
    });
  });
  return skinPackBundlePromise;
}

function loadOneKillClip(
  bundle: AssetManager.Bundle,
  packId: string,
  index: number,
): Promise<AudioClip | null> {
  const path = `${KILL_AUDIO_ROOT}/${packId}/${index}kill`;
  return new Promise((resolve) => {
    bundle.load(path, AudioClip, (err, clip) => {
      if (err) {
        console.warn(`[killAudioLoader] load failed: ${path}`, err);
        resolve(null);
        return;
      }
      resolve(clip ?? null);
    });
  });
}

function packHasAnyClip(clips: (AudioClip | null)[]): boolean {
  return clips.some((c) => c != null);
}

async function loadKillAudiosFromBundle(
  bundle: AssetManager.Bundle,
  packId: string,
): Promise<(AudioClip | null)[]> {
  const clips: (AudioClip | null)[] = [];
  for (let i = 1; i <= KILL_AUDIO_COUNT; i++) {
    clips.push(await loadOneKillClip(bundle, packId, i));
  }
  return clips;
}

/** 按皮肤 `killAudio` 加载 1kill…8kill；整包缺失时回退 `kill-normal`。 */
export async function loadKillAudios(
  packId: string,
): Promise<(AudioClip | null)[]> {
  const bundle = await loadSkinPackBundle();
  if (!bundle) {
    return Array.from({ length: KILL_AUDIO_COUNT }, () => null);
  }

  const primary = await loadKillAudiosFromBundle(bundle, packId);
  if (packHasAnyClip(primary) || packId === KILL_FALLBACK_PACK) {
    return primary;
  }

  console.warn(
    `[killAudioLoader] pack '${packId}' empty, fallback '${KILL_FALLBACK_PACK}'`,
  );
  return loadKillAudiosFromBundle(bundle, KILL_FALLBACK_PACK);
}
