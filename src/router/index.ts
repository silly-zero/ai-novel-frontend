import { createRouter, createWebHistory } from 'vue-router'
import HomePage from '@/pages/HomePage.vue'
import ChapterEditorPage from '@/pages/ChapterEditorPage.vue'
import NewNovelPage from '@/pages/NewNovelPage.vue'
import NovelReaderPage from '@/pages/NovelReaderPage.vue'
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
    path: '/novels/:novelId',
    name: 'novel-reader',
    component: NovelReaderPage,
  },
  {
    path: '/chapters/:chapterId/edit',
    name: 'chapter-edit',
    component: ChapterEditorPage,
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
