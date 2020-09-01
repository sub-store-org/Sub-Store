<template>
<v-list>
  <v-list-item v-for="proxy in proxies" :key="proxy.name">
    <v-list-item-content>
      <v-list-item-title v-text="proxy.name" class="wrap-text"></v-list-item-title>
      <v-chip-group>
        <v-chip x-small color="primary" outlined>
          <v-icon left x-small>mdi-server</v-icon>
          {{ proxy.type.toUpperCase() }}
        </v-chip>
        <v-chip x-small v-if="proxy.udp" color="blue" outlined>
          <v-icon left x-small>mdi-fire</v-icon>
          UDP
        </v-chip>
        <v-chip x-small v-if="proxy.tfo" color="success" outlined>
          <v-icon left x-small>mdi-flash</v-icon>
          TFO
        </v-chip>
        <v-chip x-small v-if="proxy.scert" color="error" outlined>
          <v-icon left x-small>error</v-icon>
          SCERT
        </v-chip>
      </v-chip-group>
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
import {axios} from "@/utils";

export default {
  name: "ProxyList",
  props: ['url'],
  data: function (){
    return {
      proxies: []
    }
  },
  methods: {
    refresh() {
      axios.post(`/refresh`, {url: this.url}).then(() => {
        this.fetch();
      })
    },

    fetch() {
      axios.get(this.url).then(resp => {
        const {data} = resp;
        this.proxies = data.split("\n").map(p => JSON.parse(p));
      }).catch(err => {
        this.$store.commit("SET_ERROR_MESSAGE", err);
      });
    }
  },
  created() {
    this.fetch();
  }
}
</script>

<style scoped>
.wrap-text {
  white-space: normal;
}
</style>