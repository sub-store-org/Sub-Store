<template>
  <v-container fluid>
    <v-spacer></v-spacer>
    <v-list dense>
      <v-subheader>单个订阅</v-subheader>
      <v-list-item
          v-for="sub in subscriptions"
          :key="sub.name"
          @click="preview(sub)"
      >
        <v-list-item-avatar>
          <v-img
              src="https://avatars2.githubusercontent.com/u/21050064?s=460&u=40a74913dd0a3d00670d05148c3a08c787470021&v=4"></v-img>
        </v-list-item-avatar>
        <v-list-item-content>
          <v-list-item-title v-text="sub.name" class="font-weight-medium"></v-list-item-title>
          <v-list-item-title v-text="sub.url"></v-list-item-title>
        </v-list-item-content>
        <v-list-item-action>
          <v-menu bottom left>
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                  icon
                  v-bind="attrs"
                  v-on="on"
              >
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>

            <v-list>
              <v-list-item
                  v-for="(menuItem, i) in editMenu"
                  :key="i"
                  @click="subscriptionMenu(menuItem.action, sub)"
              >
                <v-list-item-content>{{ menuItem.title }}</v-list-item-content>
              </v-list-item>
            </v-list>
          </v-menu>
        </v-list-item-action>
      </v-list-item>
    </v-list>
    <v-divider></v-divider>
    <v-list dense>
      <v-subheader>组合订阅</v-subheader>
      <v-list-item
          v-for="collection in collections"
          :key="collection.name"
          @click="preview(collection)"
          dense
      >
        <v-list-item-avatar>
          <v-img
              src="https://avatars2.githubusercontent.com/u/21050064?s=460&u=40a74913dd0a3d00670d05148c3a08c787470021&v=4"></v-img>
        </v-list-item-avatar>
        <v-list-item-content>
          <v-list-item-title v-text="collection.name" class="font-weight-medium"></v-list-item-title>
          <v-chip-group
              column
          >
            <v-chip
                v-for="subs in collection.subscriptions"
                :key="subs"
                small
                class="ma-2 ml-0 mr-1 pa-2"
                label
            >
              {{ subs }}
            </v-chip>
          </v-chip-group>
        </v-list-item-content>
        <v-list-item-action>
          <v-menu bottom left>
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                  icon
                  v-bind="attrs"
                  v-on="on"
              >
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>

            <v-list>
              <v-list-item
                  v-for="(menuItem, i) in editMenu"
                  :key="i"
                  @click="collectionMenu(menuItem.action, collection)"
              >
                <v-list-item-content>{{ menuItem.title }}</v-list-item-content>
              </v-list-item>
            </v-list>
          </v-menu>
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
      opened: false,
      editMenu: [
        {
          title: "复制",
          action: "COPY"
        },
        {
          title: "编辑",
          action: "EDIT"
        },
        {
          title: "删除",
          action: "DELETE"
        },
      ]
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
  },

  methods: {
    subscriptionMenu(action, sub) {
      console.log(`${action} --> ${sub.name}`);
      switch (action) {
        case 'COPY':
          this.$clipboard(`http://127.0.0.1:3000/download/${sub.name}`);
          this.$store.commit("SET_SUCCESS_MESSAGE", "成功复制订阅链接");
          break
        case 'EDIT':
          this.$router.push(`/sub-edit/${sub.name}`);
          break
        case 'DELETE':
          break
      }
    },
    collectionMenu(action, collection) {
      console.log(`${action} --> ${collection.name}`);
      switch (action) {
        case 'COPY':
          this.$clipboard(`http://127.0.0.1:3000/download/collection/${collection.name}`);
          this.$store.commit("SET_SUCCESS_MESSAGE", "成功复制订阅链接");
          break
        case 'EDIT':
          break
        case 'DELETE':
          break
      }
    },
    preview(item) {
      console.log(`PREVIEW: ${item.name}`);
    },
  }
}
</script>

<style scoped>

</style>