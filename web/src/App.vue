<template>
  <v-app>
    <TopToolbar></TopToolbar>
    <v-content>
      <router-view></router-view>
    </v-content>
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


function initStore(store) {
  store.dispatch('FETCH_SUBSCRIPTIONS');
  store.dispatch("FETCH_COLLECTIONS");
}

export default {
  components: {
    TopToolbar,
    BottomNav
  },

  created() {
    this.$vuetify.theme.dark = this.$store.state.isDarkMode;
    this.$vuetify.theme.themes.dark.primary = '#ae51e3';
    this.$vuetify.theme.themes.light.primary = '#d73964';

    initStore(this.$store);
  },

  computed: {
    successMessage: function () {
      return this.$store.state.successMessage;
    },
    errorMessage: function () {
      return this.$store.state.errorMessage;
    }
  },

  watch: {
    successMessage: function () {
      setTimeout(() => {
        this.$store.commit("SET_SUCCESS_MESSAGE", "");
      }, 1000);
    },
    errorMessage: function () {
      setTimeout(() => {
        this.$store.commit("SET_ERROR_MESSAGE", "");
      }, 1000);
    }
  }
}
</script>

<style>

</style>