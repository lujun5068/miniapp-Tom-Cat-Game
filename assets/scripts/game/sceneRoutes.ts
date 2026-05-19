export const MAIN_GAME_SCENE = 'scene-001';
export const PERSONAL_CENTER_SCENE = 'PersonalCenterPage';
/**
 * 个人中心 Bundle 名。该 Bundle 对应 `assets/personal-center/` 目录，构建时
 * 通过该目录的 `personal-center.meta` 配置为微信小游戏 subpackage，从首包独立出来。
 * 主场景仍位于默认 `main` Bundle，无需 loadBundle 即可访问；切换回主场景统一使用
 * `director.loadScene(MAIN_GAME_SCENE)`，引擎会在已加载的 Bundle 集合中按场景名查找。
 */
export const PERSONAL_CENTER_BUNDLE = 'personal-center';
