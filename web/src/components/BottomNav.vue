<template>
  <v-bottom-navigation
      app
      color="primary"
      fixed
      grow
      v-model="activeItem"
  >
<!--    <v-btn :to="{path:'/dashboard'}" value="dashboard">-->
<!--      <span>首页</span>-->
<!--      <v-icon>speed</v-icon>-->
<!--    </v-btn>-->

    <v-btn :to="{path: '/'}" value="subscription">
      <span>订阅</span>
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
