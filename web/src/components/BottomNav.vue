<template>

  <v-bottom-navigation
      app
      fixed
      grow
      v-model="activeItem"
      color="primary"
  >
    <v-btn value="dashboard">
      <span>首页</span>
      <v-icon>dashboard</v-icon>
    </v-btn>

    <v-btn value="collection">
      <span>订阅</span>
      <v-icon>favorite</v-icon>
    </v-btn>

    <v-btn value="subscription">
      <span>机场</span>
      <v-icon>code</v-icon>
    </v-btn>


  </v-bottom-navigation>

</template>

<script>
export default {
  data: () => {
    return {
      activeItem: 'collection'
    }
  }
}
</script>