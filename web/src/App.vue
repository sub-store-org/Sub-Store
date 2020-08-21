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

export default {
  components: {
    TopToolbar,
    BottomNav
  },

  created() {
    this.$vuetify.theme.dark = true;
    this.$vuetify.theme.themes.dark.primary = '#d02f2f';
  },

  computed: {
    isDarkMode() {
      return true;
    }
  }
}
</script>