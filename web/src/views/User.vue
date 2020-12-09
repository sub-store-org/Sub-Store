<template>
  <v-container>
    <v-card>
      <v-card-title>
        GitHub 配置
        <v-spacer></v-spacer>
        <v-icon small>settings</v-icon>
      </v-card-title>
      <v-card-text>
        <v-text-field
            label="GitHub 用户名"
            hint="填入GitHub用户名"
            v-model="settings.githubUser"
            clearable clear-icon="clear"
        >

        </v-text-field>
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
        <v-btn small text @click="save()" color="primary">保存</v-btn>
      </v-card-actions>
      <v-divider/>
    </v-card>

    <v-card>
      <v-card-title>
        Gist 数据同步
        <v-spacer></v-spacer>
        <v-icon small>mdi-cloud</v-icon>
      </v-card-title>
      <v-card-text>
        最近同步于：{{syncTime}}
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn small text @click="sync('upload')">上传</v-btn>
        <v-btn small text @click="sync('download')">恢复</v-btn>
      </v-card-actions>
    </v-card>
  </v-container>
</template>

<script>
import {axios, showError} from "@/utils";
import {format} from "timeago.js";

export default {
  data() {
    return {
      settings: {
        gistToken: "",
        githubUser: "",
        syncTime: ""
      }
    }
  },
  created() {
    axios.get(`/settings`).then(resp => {
      this.settings.gistToken = resp.data.gistToken;
      this.settings.githubUser = resp.data.githubUser;
      this.settings.syncTime = resp.data.syncTime;
    });
  },
  computed: {
    syncTime(){
      if (this.settings.syncTime) {
        return format(this.settings.syncTime, "zh_CN");
      } else {
        return "从未同步";
      }
    }
  },
  methods: {
    save() {
      axios.patch(`/settings`, this.settings);
      this.$store.commit("SET_SUCCESS_MESSAGE", `保存成功！`);
    },

    // eslint-disable-next-line no-unused-vars
    sync(action) {
      if (!this.settings.gistToken) {
        this.$store.commit("SET_ERROR_MESSAGE", "未设置GitHub Token！");
        return;
      }
      axios.get(`/utils/backup?action=${action}`).then(resp => {
        if (resp.data.status === 'success') {
          this.$store.commit("SET_SUCCESS_MESSAGE", `${action === 'upload' ? "备份" : "还原"}成功！`);
          this.settings.syncTime = new Date().getTime();
          axios.patch(`/settings`, this.settings);
          this.updateStore(this.$store);
        } else
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
      store.dispatch("FETCH_ARTIFACTS").catch(() => {
        showError(`无法拉取同步配置！`);
      });
    }
  }
}
</script>

<style scoped>

</style>