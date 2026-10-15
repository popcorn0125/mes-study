import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'

const app = createApp(App).use(createPinia()).use(router)
// 첫 화면의 레이아웃(대시보드/전체 화면)이 정해진 뒤에 띄운다
router.isReady().then(() => app.mount('#app'))
