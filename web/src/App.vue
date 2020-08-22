<template>
  <v-app>
    <TopToolbar></TopToolbar>
    <v-content>
      <router-view></router-view>
    </v-content>
    <BottomNav></BottomNav>
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

  }
}
</script>