<template>
  <div>
    <v-navigation-drawer
        app
        fixed
        v-model="showMenu"
    >
      <v-list dense>
        <v-list-item @click="doNothing">
          <v-list-item-action>
            <v-icon>settings</v-icon>
          </v-list-item-action>
          <v-list-item-content>
            <v-list-item-title>Settings</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
        <v-list-item @click="doNothing">
          <v-list-item-action>
            <v-icon>help</v-icon>
          </v-list-item-action>
          <v-list-item-content>
            <v-list-item-title>Help</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar
        app
        color="primary"
        dark
        fixed
    >
      <v-app-bar-nav-icon @click.stop="toggleMenu"></v-app-bar-nav-icon>

      <v-toolbar-title>{{title}}</v-toolbar-title>

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

  methods: {
    toggleMenu: function () {
      this.showMenu = !this.showMenu;
    },
    doNothing: function () {

    }
  },

  computed: {
    title: function () {
      return this.$store.state.title;
    }
  }
}
</script>