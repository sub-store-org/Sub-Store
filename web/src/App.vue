<template>
  <v-app>
    <TopToolbar></TopToolbar>
    <v-main>
      <router-view></router-view>
    </v-main>
    <BottomNav></BottomNav>
    <v-snackbar
        :value="successMessage"
        app
        bottom
        color="success"
        elevation="20"
    >
      {{ successMessage }}
    </v-snackbar>

    <v-snackbar
        :value="errorMessage"
        app
        bottom
        color="error"
        elevation="20"
    >
      {{ errorMessage }}
    </v-snackbar>
  </v-app>
</template>

<script>

import TopToolbar from "@/components/TopToolbar";
import BottomNav from "@/components/BottomNav";
import {showError} from "@/utils";


function initStore(store) {
  store.dispatch('FETCH_SUBSCRIPTIONS').catch(() => {
    showError(`无法拉取订阅列表!`);
  });
  store.dispatch("FETCH_COLLECTIONS").catch(() => {
    showError(`无法拉取组合订阅列表！`);
  });
  store.dispatch("FETCH_ENV").catch(() => {
    showError(`无法获取当前运行环境！`);
  });
}

export default {
  components: {
    TopToolbar,
    BottomNav,
  },

  created() {
    initStore(this.$store);
  },

  computed: {
    successMessage() {
      return this.$store.state.successMessage;
    },
    errorMessage() {
      return this.$store.state.errorMessage;
    },
  },

  watch: {
    successMessage() {
      setTimeout(() => {
        this.$store.commit("SET_SUCCESS_MESSAGE", "");
      }, 1000);
    },
    errorMessage() {
      setTimeout(() => {
        this.$store.commit("SET_ERROR_MESSAGE", "");
      }, 1000);
    },
  }
}
</script>

<style lang="scss">
@import "./assets/css/app";
@import "./assets/css/general.css";
</style>