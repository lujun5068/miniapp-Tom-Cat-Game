import { assetManager, director } from 'cc';
import { WECHAT } from 'cc/env';

export const MAIN_GAME_SCENE = 'scene-001';
export const PERSONAL_CENTER_SCENE = 'PersonalCenterPage';
/**
 * 个人中心 Bundle 名。该 Bundle 对应 `assets/personal-center/` 目录，构建时
 * 通过该目录的 `personal-center.meta` 配置为微信小游戏 subpackage，从首包独立出来。
 * 主场景仍位于默认 `main` Bundle，无需 loadBundle 即可访问。
 */
export const PERSONAL_CENTER_BUNDLE = 'personal-center';

const LOG_TAG = '[sceneRoutes]';

/**
 * 切回主游戏场景。主场景在默认 main Bundle 内，所以直接 `director.loadScene` 即可。
 * 个人中心返回主场景、关卡间切换都应通过此函数，避免散落硬编码字符串。
 */
export function loadMainGameScene(): void {
  director.loadScene(MAIN_GAME_SCENE);
}

/**
 * 进入个人中心场景。优先通过 Bundle 加载（与微信小游戏分包配置匹配），
 * Bundle 或场景加载失败时，只在非微信环境下回退到 `director.loadScene`，
 * 便于在 Cocos 编辑器预览中无 Bundle 配置时仍可访问。
 *
 * 真机/微信小游戏构建里 Bundle 不应该出现失败；如出现请检查 `assets/personal-center.meta`
 * 中 `userData.bundleName` 与 `PERSONAL_CENTER_BUNDLE` 是否一致。
 */
export function loadPersonalCenterScene(): void {
  const bundleName = PERSONAL_CENTER_BUNDLE;
  const sceneName = PERSONAL_CENTER_SCENE;
  if (!bundleName) {
    console.error(`${LOG_TAG} personal center bundle name is empty`);
    fallbackLoadScene(sceneName);
    return;
  }

  console.log(
    `${LOG_TAG} load bundle scene: bundle=${bundleName}, scene=${sceneName}`,
  );
  assetManager.loadBundle(bundleName, (bundleError, bundle) => {
    if (bundleError || !bundle) {
      console.error(
        `${LOG_TAG} load bundle failed: ${bundleName}`,
        bundleError,
      );
      fallbackLoadScene(sceneName);
      return;
    }
    bundle.loadScene(sceneName, (sceneError, sceneAsset) => {
      if (sceneError || !sceneAsset) {
        console.error(
          `${LOG_TAG} load scene from bundle failed: bundle=${bundleName}, scene=${sceneName}`,
          sceneError,
        );
        fallbackLoadScene(sceneName);
        return;
      }
      console.log(
        `${LOG_TAG} run bundle scene: bundle=${bundleName}, scene=${sceneName}`,
      );
      director.runScene(sceneAsset);
    });
  });
}

function fallbackLoadScene(sceneName: string): void {
  if (WECHAT) return;
  console.warn(
    `${LOG_TAG} fallback to director.loadScene in non-WeChat preview: ${sceneName}`,
  );
  director.loadScene(sceneName);
}
