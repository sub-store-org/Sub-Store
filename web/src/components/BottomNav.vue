<template>
  <v-bottom-navigation
      v-model="activeItem"
      app
      color="primary"
      fixed
      grow
  >
    <v-btn :to="{path: '/'}" value="subscription">
      <span>订阅</span>
      <v-icon>flight_takeoff</v-icon>
    </v-btn>

    <v-btn :to="{path: '/cloud'}" value="artifacts">
      <span>同步</span>
      <v-icon>mdi-cloud</v-icon>
    </v-btn>

    <v-btn :to="{path: '/user'}" value="user">
      <span>我的</span>
      <v-icon>mdi-account</v-icon>
    </v-btn>
  </v-bottom-navigation>

</template>

<script>
export default {
  data: () => {
    return {
      activeItem: 'subscription'
    }
  }
}
</script>
