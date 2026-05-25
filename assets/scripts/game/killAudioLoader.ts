import { AudioClip, assetManager, type AssetManager } from 'cc';

/** `assets/skin-pack/kill-audios/kill/{1..8}kill.m4a`，与 `skin-pack` 分包共用 Bundle。 */
const KILL_AUDIO_ROOT = 'kill-audios/kill';
const SKIN_PACK_BUNDLE = 'skin-pack';
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
  index: number,
): Promise<AudioClip | null> {
  const path = `${KILL_AUDIO_ROOT}/${index}kill`;
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

/** 按 1kill … 8kill 顺序加载；缺失项为 null，播放时跳过。 */
export async function loadKillAudios(): Promise<(AudioClip | null)[]> {
  const bundle = await loadSkinPackBundle();
  if (!bundle) {
    return Array.from({ length: KILL_AUDIO_COUNT }, () => null);
  }
  const clips: (AudioClip | null)[] = [];
  for (let i = 1; i <= KILL_AUDIO_COUNT; i++) {
    clips.push(await loadOneKillClip(bundle, i));
  }
  return clips;
}
