<template>
  <div>
    <v-app-bar
        :clipped="true"
        :mini-variant="false"
        app fixed
    >
      <v-toolbar-title><h3>{{ title }}</h3></v-toolbar-title>
    </v-app-bar>

  </div>
</template>

<script>
export default {
  data: () => {
    return {
      showMenu: false
    }
  },

  methods: {},

  computed: {
    title: function () {
      return this.$store.state.title;
    }
  }
}
</script>
