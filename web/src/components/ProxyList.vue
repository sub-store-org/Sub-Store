<template>
<v-list>
  <v-list-item v-for="proxy in proxies" :key="proxy.name">
    <v-list-item-content>
      <v-list-item-title v-text="proxy.name" class="wrap-text"></v-list-item-title>
      <v-list-item-subtitle v-text="getType(proxy.type)"></v-list-item-subtitle>
    </v-list-item-content>
    <v-list-item-action>
      <v-btn icon>
        <v-icon color="grey lighten-1">mdi-information</v-icon>
      </v-btn>
    </v-list-item-action>
  </v-list-item>
</v-list>
</template>

<script>
export default {
  name: "ProxyList",
  props: ['proxies'],
  methods: {
    getType(type) {
      switch (type) {
        case 'ss':
          return 'shadowsocks'
        case 'ssr':
          return 'shadowsocksr'
        default:
          return type
      }
    }
  }
}
</script>

<style scoped>
.wrap-text {
  white-space: normal;
}
</style>