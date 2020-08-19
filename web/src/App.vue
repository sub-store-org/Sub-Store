<template>
  <v-app>
    <TopToolbar></TopToolbar>
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

  props: {
    source: String,
  },

  data: () => ({
    drawer: null,
  }),

  created() {
    this.$vuetify.theme.dark = true
  },
}
</script>