import type { InjectionKey } from 'vue'

/** 3D 장면이 대시보드 위젯 안에 들어가 있는지(라벨 숨김 등에 쓴다) */
export const SCENE_EMBEDDED: InjectionKey<boolean> = Symbol('sceneEmbedded')
