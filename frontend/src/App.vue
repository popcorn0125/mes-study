<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import DashboardLayout from './layout/DashboardLayout.vue'

const route = useRoute()
</script>

<template>
  <RouterView v-if="route.meta.fullscreen" />
  <DashboardLayout v-else>
    <RouterView />
  </DashboardLayout>
</template>
