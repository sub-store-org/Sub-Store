<template>
  <v-card
      class="mb-4 ml-4 mr-4 mt-4"
  >
    <v-card-title>
      云同步
      <v-spacer></v-spacer>
      <v-icon small>cloud</v-icon>
    </v-card-title>
    <v-card-text>
      <v-text-field
          label="GitHub Token"
          hint="填入GitHub Token"
          v-model="settings.gistToken"
          clearable clear-icon="clear"
      />
    </v-card-text>
    <v-divider></v-divider>
    <v-card-actions>
      <v-spacer></v-spacer>
      <v-btn label @click="sync('upload')">上传</v-btn>
      <v-btn label @click="sync('download')">下载</v-btn>
    </v-card-actions>
    <v-divider/>
  </v-card>
</template>

<script>
import {axios, showError} from "@/utils";

export default {
  data() {
    return {
      settings: {
        gistToken: ""
      }
    }
  },
  created() {
    axios.get(`/settings`).then(resp => {
      this.settings.gistToken = resp.data.gistToken;
    });
  },
  methods: {
    save() {
      axios.patch(`/settings`, this.settings);
    },

    sync(action) {
      if (!this.settings.gistToken) {
        this.$store.commit("SET_ERROR_MESSAGE", "未设置GitHub Token！");
        return;
      }
      this.save();
      axios.get(`/utils/backup?action=${action}`).then(resp => {
        if (resp.data.status === 'success') {
          this.$store.commit("SET_SUCCESS_MESSAGE", `${action === 'upload' ? "备份" : "还原"}成功！`);
          this.updateStore(this.$store);
        }
        else
          this.$store.commit("SET_ERROR_MESSAGE", `备份失败！${resp.data.message}`);
      });
    },

    updateStore(store) {
      store.dispatch('FETCH_SUBSCRIPTIONS').catch(() => {
        showError(`无法拉取订阅列表!`);
      });
      store.dispatch("FETCH_COLLECTIONS").catch(() => {
        showError(`无法拉取组合订阅列表！`);
      });
    }
  }
}
</script>

<style scoped>

</style>