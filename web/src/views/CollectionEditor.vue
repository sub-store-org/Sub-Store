<template>
  <v-container>
    <v-card class="mb-4">
      <v-card-title>订阅配置</v-card-title>
      <v-form class="pl-4 pr-4 pb-4" v-model="valid">
        <v-subheader class="pl-0">订阅名称</v-subheader>
        <v-text-field
            v-model="name"
            class="mt-2"
            :rules="validations.nameRules"
            required
            placeholder="填入订阅名称，名称需唯一"
        />
        <v-divider></v-divider>
        <v-subheader class="pl-0">包含的订阅</v-subheader>
        <v-list dense>
          <v-list-item v-for="sub in availableSubs" :key="sub.name">
            <v-list-item-avatar dark>
              <v-icon>mdi-cloud</v-icon>
            </v-list-item-avatar>
            <v-list-item-content>
              {{ sub.name }}
            </v-list-item-content>
            <v-spacer></v-spacer>
            <v-checkbox
                :value="sub.name"
                v-model="selected"
                class="pr-1"
            />
          </v-list-item>
        </v-list>
      </v-form>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn icon @click="save"><v-icon>save_alt</v-icon></v-btn>
        <v-btn icon @click="discard"><v-icon>settings_backup_restore</v-icon></v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script>
import {showInfo, showError} from "@/utils";

export default {
  data: function () {
    return {
      valid: false,
      validations: {
        nameRules: [
          v => !!v || "名字不能为空",
          v => /^[\w-_]*$/.test(v) || "订阅名称只能包含英文字符、横杠和下划线！"
        ]
      },
      selected: [],
      name: ""
    }
  },
  computed: {
    availableSubs() {
      return this.$store.state.subscriptions;
    }
  },
  methods: {
    save() {
      if (!this.valid || this.selected.length === 0) {
        return;
      }
      if (this.$route.params.name === 'UNTITLED') {
        this.$store.dispatch("NEW_COLLECTION", {
          name: this.name,
          subscriptions: this.selected
        }).then(() => {
          showInfo(`成功创建订阅：${this.name}！`)
        }).catch(() => {
          showError(`发生错误，无法创建订阅！`)
        });
      } else {
        this.$store.dispatch("UPDATE_COLLECTION", {
          name: this.$route.params.name,
          collection: {
            name: this.name,
            subscriptions: this.selected
          }
        }).then(() => {
          showInfo(`成功保存订阅：${this.name}！`)
        }).catch(() => {
          showError(`发生错误，无法保存订阅！`)
        });
      }
    },

    discard() {
      this.$router.back();
    }
  },
  created() {
    const name = this.$route.params.name;
    const collection = this.$store.state.collections[name] || {};
    this.$store.commit("SET_NAV_TITLE", collection.name ? `组合订阅编辑 -- ${collection.name}` : "新建组合订阅");
    this.name = collection.name;
    this.selected = collection.subscriptions || [];
  },

}
</script>

<style scoped>

</style>