<template>
  <v-container fluid>
    <v-spacer></v-spacer>
    <v-list inset dense>
      <v-subheader>单个订阅</v-subheader>
      <v-list-item
          v-for="item in subscriptions"
          :key="item.name"
      >
        <v-list-item-avatar>
          <v-img
              src="https://avatars2.githubusercontent.com/u/21050064?s=460&u=40a74913dd0a3d00670d05148c3a08c787470021&v=4"></v-img>
        </v-list-item-avatar>
        <v-list-item-content>
          <v-list-item-title v-text="item.name" class="font-weight-medium"></v-list-item-title>
          <v-list-item-title v-text="item.url"></v-list-item-title>
        </v-list-item-content>
        <v-list-item-action>
          <v-btn icon>
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </v-list-item-action>
      </v-list-item>
    </v-list>
    <v-divider></v-divider>
    <v-list inset dense>
      <v-subheader>组合订阅</v-subheader>
      <v-list-item
          v-for="item in collections"
          :key="item.name"
          dense
      >
        <v-list-item-avatar>
          <v-img
              src="https://avatars2.githubusercontent.com/u/21050064?s=460&u=40a74913dd0a3d00670d05148c3a08c787470021&v=4"></v-img>
        </v-list-item-avatar>
        <v-list-item-content>
          <v-list-item-title v-text="item.name" class="font-weight-medium"></v-list-item-title>
          <v-chip-group
              column
          >
            <v-chip
                v-for="subs in item.subscriptions"
                :key="subs"
                small
                class="ma-2"
                label
            >
              {{ subs }}
            </v-chip>
          </v-chip-group>
        </v-list-item-content>
        <v-list-item-action>
          <v-btn icon>
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </v-list-item-action>
      </v-list-item>
    </v-list>
    <v-fab-transition>
      <v-speed-dial
          v-model="opened"
          direction="top"
          right
          fab
          absolute
          bottom
          small
          transition="slide-y-reverse-transition"
      >
        <template #activator>
          <v-btn
              fab
          >
            <v-icon v-if="opened">mdi-close</v-icon>
            <v-icon v-else>apps</v-icon>
          </v-btn>
        </template>
        <v-btn
            fab
            color="primary"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </v-speed-dial>
    </v-fab-transition>
  </v-container>
</template>

<script>
export default {
  data: () => {
    return {
      opened: false
    }
  },

  computed: {
    subscriptions: function () {
      const subs = this.$store.state.subscriptions;
      return Object.keys(subs).map(k => subs[k]);
    },
    collections: function () {
      const cols = this.$store.state.collections;
      return Object.keys(cols).map(k => cols[k]);
    }
  }
}
</script>

<style scoped>

</style>