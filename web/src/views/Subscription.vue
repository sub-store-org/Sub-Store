<template>
  <v-container fluid>
    <v-card>
      <v-card-title>
        <v-icon left>local_airport</v-icon>
        单个订阅
        <v-spacer></v-spacer>
        <v-btn icon @click="createSub">
          <v-icon color="primary">mdi-plus-circle</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-list dense>
          <v-list-item
              v-for="sub in subscriptions"
              :key="sub.name"
              @click="preview(sub)"
          >
            <v-list-item-avatar>
              <v-icon v-if="!sub.icon" color="teal darken-1">mdi-cloud</v-icon>
              <v-img :src="sub.icon" v-else :class="sub.icon.indexOf('#invert') !== -1 ? 'invert' : ''"/>
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
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-title>
        <v-icon left>work_outline</v-icon>
        组合订阅
        <v-spacer></v-spacer>
        <v-btn icon @click="createCol">
          <v-icon color="primary">mdi-plus-circle</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        <v-list dense>
          <v-list-item
              v-for="collection in collections"
              :key="collection.name"
              @click="preview(collection, type='collection')"
              dense
          >
            <v-list-item-avatar>
              <v-icon v-if="!collection.icon" color="teal darken-1">mdi-cloud</v-icon>
              <v-img :src="collection.icon" v-else :class="collection.icon.indexOf('#invert') !== -1 ? 'invert' : ''"/>
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
      </v-card-text>
    </v-card>
    <v-dialog fullscreen hide-overlay transition="dialog-bottom-transition" v-model="showProxyList" scrollable>
      <v-card>
        <v-card-title class="pa-0">
          <v-toolbar>
            <v-icon>mdi-cloud</v-icon>
            <v-spacer></v-spacer>
            <v-toolbar-title><h4>节点列表</h4></v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
              <v-btn icon @click="refreshProxyList" v-if="sub">
                <v-icon>refresh</v-icon>
              </v-btn>
              <v-btn icon @click="showProxyList = false">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-toolbar-items>
          </v-toolbar>
        </v-card-title>
        <v-card-text class="pl-0 pr-0">
          <proxy-list :url="url" :sub="sub" ref="proxyList" :key="url"></proxy-list>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script>
import ProxyList from "@/components/ProxyList";
import {BACKEND_BASE} from "@/config";

export default {
  components: {ProxyList},
  data: () => {
    return {
      opened: false,
      showProxyList: false,
      url: "",
      sub: [],
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
        // {
        //   title: "上移",
        //   action: "MOVE_UP"
        // },
        // {
        //   title: "下移",
        //   action: "MOVE_DOWN"
        // }
      ]
    }
  },

  computed: {
    subscriptionBaseURL() {
      return BACKEND_BASE;
    },
    subscriptions: {
      get(){
        const subs = this.$store.state.subscriptions;
        return Object.keys(subs).map(k => subs[k]);
      },
      set(){

      }
    },
    collections() {
      const cols = this.$store.state.collections;
      return Object.keys(cols).map(k => cols[k]);
    }
  },

  methods: {
    subscriptionMenu(action, sub) {
      console.log(`${action} --> ${sub.name}`);
      switch (action) {
        case 'COPY':
          this.$clipboard(`${this.subscriptionBaseURL}/download/${sub.name}`);
          this.$store.commit("SET_SUCCESS_MESSAGE", "成功复制订阅链接");
          break
        case 'EDIT':
          this.$router.push(`/sub-edit/${sub.name}`);
          break
        case 'DELETE':
          this.$store.dispatch("DELETE_SUBSCRIPTION", sub.name);
          break
        case 'MOVE_UP':
          this.moveUpSubscription(sub.name);
          break
        case 'MOVE_DOWN':

          break
      }
    },
    collectionMenu(action, collection) {
      console.log(`${action} --> ${collection.name}`);
      switch (action) {
        case 'COPY':
          this.$clipboard(`${this.subscriptionBaseURL}/download/collection/${collection.name}`);
          this.$store.commit("SET_SUCCESS_MESSAGE", "成功复制订阅链接");
          break
        case 'EDIT':
          this.$router.push(`/collection-edit/${collection.name}`);
          break
        case 'DELETE':
          this.$store.dispatch("DELETE_COLLECTION", collection.name);
          break
      }
    },
    preview(item, type = 'sub') {
      if (type === 'sub') {
        this.url = `${BACKEND_BASE}/download/${item.name}`;
        this.sub = item.url;
      } else {
        this.url = `${BACKEND_BASE}/download/collection/${item.name}`
      }
      this.showProxyList = true;
    },
    createSub() {
      this.$router.push("/sub-edit/UNTITLED");
    },
    createCol() {
      this.$router.push("/collection-edit/UNTITLED")
    },
    refreshProxyList() {
      this.$refs.proxyList.refresh();
    },
    moveUpSubscription(name) {
      let index = 0;
      for (; index < this.subscriptions.length; index++) {
        if (this.subscriptions[index].name === name) {
          break;
        }
      }
      if (index === 0) return;
      // otherwise swap with previous one
      const prev = this.subscriptions[index - 1];
      const cur = this.subscriptions[index];
      this.subscriptions.splice(index - 1, 2, cur, prev);
    },
    // moveDownSubscription(name) {
    //
    // }
  }
}
</script>

<style scoped>
.invert {
  filter: invert(100%);
}
</style>