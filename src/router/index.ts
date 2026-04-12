import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'
import NewNovelPage from '@/pages/NewNovelPage.vue'
import NovelWorkbenchPage from '@/pages/NovelWorkbenchPage.vue'

// 定义路由配置
const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/novels/new',
    name: 'novel-new',
    component: NewNovelPage,
  },
  {
    path: '/novel/:novelId',
    name: 'workbench',
    component: NovelWorkbenchPage,
  },
]

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
