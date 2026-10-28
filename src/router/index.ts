import { createRouter, createWebHistory } from 'vue-router'
import ChecklistWorkspaceView from '@/views/ChecklistWorkspaceView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'checklists', component: ChecklistWorkspaceView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
