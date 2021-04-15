<template>
  <v-container fluid>
    <v-card>
      <v-card-title>
        <v-icon left>mdi-cloud</v-icon>
        数据同步
        <v-spacer></v-spacer>
        <v-btn icon @click="openGist()">
          <v-icon color="primary" small>visibility</v-icon>
        </v-btn>
      </v-card-title>
      <v-card-text>
        最近同步于：{{ syncTime }}
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn :loading="status.uploading"
               class="ma-2 white--text"
               color="blue-grey"
               small
               @click="sync('upload')">
          上传
          <v-icon right>
            mdi-cloud-upload
          </v-icon>
        </v-btn>
        <v-btn :loading="status.downloading"
               class="ma-2 white--text"
               color="blue-grey"
               small
               @click="sync('download')">
          恢复
          <v-icon right>
            mdi-cloud-download
          </v-icon>
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card>
      <v-card-title>
        <v-icon left>settings</v-icon>
        设置
        <v-spacer></v-spacer>
      </v-card-title>
      <v-card-text>
        <v-list dense>
          <v-subheader>GitHub配置</v-subheader>
          <v-list-item>
            <v-col>
              <v-row>
                <v-text-field
                    v-model="settings.githubUser"
                    clear-icon="clear"
                    clearable
                    hint="填入GitHub用户名" label="GitHub 用户名"
                />
              </v-row>
              <v-row>
                <v-text-field
                    v-model="settings.gistToken"
                    clear-icon="clear"
                    clearable
                    hint="填入GitHub Token" label="GitHub Token"
                />
              </v-row>
            </v-col>
          </v-list-item>
          <v-divider></v-divider>
          <v-subheader>外观</v-subheader>
          <v-list-item>
            <v-list-item-content>
              夜间模式 (实验性支持)
            </v-list-item-content>
            <v-list-item-action>
              <v-switch
                  v-model="settings.theme.darkMode"
                  hide-details
                  label=""
              />
            </v-list-item-action>
          </v-list-item>
        </v-list>
      </v-card-text>
      <v-divider></v-divider>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" small text @click="save()">保存</v-btn>
      </v-card-actions>
    </v-card>

    <!--    <v-card>-->
    <!--      <v-card-title>-->
    <!--        <v-icon left>-->
    <!--          mdi-star-->
    <!--        </v-icon>-->
    <!--        关于-->
    <!--      </v-card-title>-->
    <!--      <v-card-text>-->
    <!--        <v-list>-->
    <!--          <v-list-item>-->
    <!--            <v-list-item-title>GitHub</v-list-item-title>-->
    <!--          </v-list-item>-->
    <!--        </v-list>-->
    <!--      </v-card-text>-->
    <!--    </v-card>-->
  </v-container>
</template>

<script>
import {axios, showError} from "@/utils";
import {format} from "timeago.js";

export default {
  data() {
    return {
      status: {
        uploading: false,
        downloading: false
      }
    }
  },
  computed: {
    settings: {
      get() {
        return this.$store.state.settings;
      },
      set(value) {
        this.$store.state.settings = value;
      }
    },
    syncTime() {
      if (this.settings.syncTime) {
        return format(this.settings.syncTime, "zh_CN");
      } else {
        return "从未同步";
      }
    }
  },
  methods: {
    async save() {
      await axios.patch(`/settings`, this.settings);
      await this.$store.dispatch("FETCH_SETTINGS");
      this.$store.commit("SET_SUCCESS_MESSAGE", `保存成功！`);
    },

    // eslint-disable-next-line no-unused-vars
    async sync(action) {
      const setLoading = (status) => {
        if (action === 'upload') {
          this.status.uploading = status;
        } else if (action === 'download') {
          this.status.downloading = status;
        }
      }

      if (!this.settings.gistToken) {
        this.$store.commit("SET_ERROR_MESSAGE", "未设置GitHub Token！");
        return;
      }

      setLoading(true);
      axios.get(`/utils/backup?action=${action}`).then(resp => {
        if (resp.data.status === 'success') {
          this.$store.commit("SET_SUCCESS_MESSAGE", `${action === 'upload' ? "备份" : "还原"}成功！`);
          this.updateStore(this.$store);
        }
      }).catch(err => {
        this.$store.commit("SET_ERROR_MESSAGE", `备份失败！${err}`);
      }).finally(() => {
        setLoading(false);
      });
    },

    updateStore(store) {
      store.dispatch('FETCH_SUBSCRIPTIONS').catch(() => {
        showError(`无法拉取订阅列表!`);
      });
      store.dispatch("FETCH_COLLECTIONS").catch(() => {
        showError(`无法拉取组合订阅列表！`);
      });
      store.dispatch("FETCH_SETTINGS").catch(() => {
        showError(`无法拉取设置！`);
      });
      store.dispatch("FETCH_ARTIFACTS").catch(() => {
        showError(`无法拉取同步配置！`);
      });
    },

    openGist() {
      window.open(`https://gist.github.com${'/' + this.settings.githubUser || ''}`)
    }
  }
}
</script>

<style scoped>

</style>