<template>
  <v-card
      class="mb-4 ml-4 mr-4 mt-4"
  >
    <v-card-title>
      设置
      <v-spacer></v-spacer>
      <v-icon small>settings</v-icon>
    </v-card-title>
    <v-card-text>
      <v-text-field
          label="GitHub Token"
          hint="填入GitHub Token"
          :value="settings.gistToken"
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
import {axios} from "@/utils";

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
      this.settings = resp.data;
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
      axios.get(`/backup?action=${action}`).then(() => {
        this.$store.commit("SET_SUCCESS_MESSAGE", `${action === 'upload' ? "备份" : "还原"}成功！`);
      }).catch(err => {
        this.$store.commit("SET_ERROR_MESSAGE", `备份失败！${err}`);
      });
    },
  }
}
</script>

<style scoped>

</style>