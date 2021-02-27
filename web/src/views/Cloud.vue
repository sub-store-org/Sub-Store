<template>
  <v-container fluid>
    <v-card>
      <v-card-title>
        <v-icon left>mdi-cloud</v-icon>
        同步配置
        <v-spacer></v-spacer>
        <v-btn icon @click="openGist()">
          <v-icon>visibility</v-icon>
        </v-btn>
        <v-dialog v-model="showArtifactDialog" max-width="400px">
          <template #activator="{on}">
            <v-btn v-on="on" icon>
              <v-icon color="primary">mdi-plus-circle</v-icon>
            </v-btn>
          </template>
          <v-card class="pl-4 pr-4 pb-4 pt-4">
            <v-subheader>
              <v-icon left>{{ editing ? 'edit_off' : 'mdi-plus-circle' }}</v-icon>
              <h3>{{ editing ? '修改' : '添加' }}同步配置</h3>
            </v-subheader>
            <v-divider></v-divider>
            <v-form v-model="formValid" class="pt-4 pl-4 pr-4 pb-0">
              <v-text-field
                  v-model="currentArtifact.name"
                  :disabled="editing"
                  :rules="validations.nameRules"
                  clear-icon="clear"
                  clearable
                  label="配置名称"
                  placeholder="填入生成配置名称，名称需唯一，如Clash.yaml。"
              />
              <v-menu offset-y>
                <template v-slot:activator="{on}">
                  <v-text-field
                      v-on="on"
                      :rules="validations.required"
                      :value="getType(currentArtifact.type)"
                      label="类型"
                  />
                </template>
                <v-list dense>
                  <v-list-item @click="setArtifactType('subscription')">
                    <v-list-item-icon>
                      <v-icon>mdi-link</v-icon>
                    </v-list-item-icon>
                    <v-list-item-title>订阅</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="setArtifactType('collection')">
                    <v-list-item-icon>
                      <v-icon>list</v-icon>
                    </v-list-item-icon>
                    <v-list-item-title>组合订阅</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
              <v-menu offset-y>
                <template v-slot:activator="{on}">
                  <v-text-field
                      v-model="currentArtifact.source"
                      v-on="on"
                      :placeholder="`填入${getType(currentArtifact.type) || '来源'}的名称。`"
                      :rules="validations.required"
                      label="来源"
                  />
                </template>
                <v-list dense>
                  <v-list-item
                      v-for="(sub, idx) in getSources(currentArtifact.type)"
                      :key="idx"
                      @click="currentArtifact.source = sub.name"
                  >
                    <v-list-item-avatar>
                      <v-icon v-if="!sub.icon" color="teal darken-1">mdi-cloud</v-icon>
                      <v-img v-else :class="getIconClass(sub.icon)" :src="sub.icon"/>
                    </v-list-item-avatar>
                    <v-list-item-title>{{ sub.name }}</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>

              <v-menu offset-y>
                <template v-slot:activator="{on}">
                  <v-text-field
                      v-on="on"
                      :rules="validations.required"
                      :value="currentArtifact.platform"
                      label="目标"
                  />
                </template>
                <v-list dense>
                  <v-list-item
                      v-for="platform in ['Surge', 'Loon', 'QX', 'Clash']"
                      :key="platform"
                      @click="currentArtifact.platform = platform"
                  >
                    <v-list-item-avatar>
                      <v-img :class="getIconClass('#invert')" :src="getIcon(platform)"></v-img>
                    </v-list-item-avatar>
                    <v-list-item-title>{{ platform }}</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </v-form>
            <v-divider></v-divider>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn :disabled="!formValid" color="primary" small text @click="doneEditArtifact()">
                确认
              </v-btn>
              <v-btn small text @click="clear()">
                取消
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-card-title>

      <template v-for="(artifact, idx) in artifacts">
        <v-list-item :key="artifact.name" dense three-line>
          <v-list-item-avatar>
            <v-img :class="getIconClass('#invert')" :src="getIcon(artifact.platform)"/>
          </v-list-item-avatar>
          <v-list-item-content>
            <v-list-item-title>
              {{ artifact.name }}
            </v-list-item-title>
            <v-chip-group>
              <v-chip label>
                <v-icon left>info</v-icon>
                {{ getType(artifact.type) }}
              </v-chip>
              <v-chip label>
                <v-icon left>mdi-link</v-icon>
                {{ artifact.source }}
              </v-chip>
            </v-chip-group>
            <v-list-item-subtitle>更新于：{{ getUpdatedTime(artifact.updated) }}</v-list-item-subtitle>
          </v-list-item-content>
          <v-list-item-action>
            <v-row>
              <v-col>
                <v-btn icon @click="toggleSync(artifact)">
                  <v-icon :color="artifact.sync ? undefined: 'red'">{{ artifact.sync ? "alarm" : "alarm_off" }}</v-icon>
                </v-btn>
              </v-col>
              <v-col>
                <v-menu bottom left>
                  <template #activator="{ on }">
                    <v-btn v-on="on" icon>
                      <v-icon>mdi-dots-vertical</v-icon>
                    </v-btn>
                  </template>
                  <v-list dense>
                    <v-list-item v-if="artifact.url" @click="copy(artifact.url)">
                      <v-list-item-title>复制</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="editArtifact(artifact)">
                      <v-list-item-title>编辑</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="preview(artifact.name)">
                      <v-list-item-title>预览</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="sync(artifact.name)">
                      <v-list-item-title>同步</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="deleteArtifact(idx, artifact.name)">
                      <v-list-item-title>删除</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </v-col>
            </v-row>
          </v-list-item-action>
        </v-list-item>
      </template>
    </v-card>
  </v-container>
</template>

<script>
import {axios} from '@/utils';
import {BACKEND_BASE} from "@/config";
import {format} from 'timeago.js';

export default {
  name: "Cloud",
  data() {
    return {
      showArtifactDialog: false,
      currentArtifact: {
        name: "",
        type: "subscription",
        source: "",
        platform: "",
      },
      editing: null,
      formValid: false,
      validations: {
        nameRules: [
          v => !!v || "订阅名称不能为空！",
          v => /^[\w-_.]*$/.test(v) || "订阅名称只能包含英文字符、横杠、点和下划线！"
        ],
        required: [
          v => !!v || "不能为空！"
        ]
      }
    }
  },
  computed: {
    artifacts() {
      const items = this.$store.state.artifacts;
      return Object.keys(items).map(k => items[k]);
    },
    settings() {
      return this.$store.state.settings;
    }
  },
  methods: {
    getIcon(platform) {
      const ICONS = {
        "Clash": "https://raw.githubusercontent.com/58xinian/icon/master/clash_mini.png",
        "QX": "https://raw.githubusercontent.com/Orz-3/mini/none/quanX.png",
        "Surge": "https://raw.githubusercontent.com/Orz-3/mini/none/surge.png",
        "Loon": "https://raw.githubusercontent.com/Orz-3/mini/none/loon.png",
        "ShadowRocket": "https://raw.githubusercontent.com/Orz-3/mini/master/loon.png"
      }
      return ICONS[platform];
    },

    getType(type) {
      const DESCRIPTIONS = {
        "subscription": "订阅",
        "collection": "组合订阅"
      }
      return DESCRIPTIONS[type];
    },

    getUpdatedTime(time) {
      if (!time) {
        return "从未更新";
      } else {
        return format(time, "zh_CN");
      }
    },

    async doneEditArtifact() {
      console.log(JSON.stringify(this.currentArtifact, null, 2));
      try {
        if (this.editing) {
          await axios.patch(`/artifact/${this.currentArtifact.name}`, this.currentArtifact);
        } else {
          await axios.post("/artifacts", this.currentArtifact);
        }
        await this.$store.dispatch("FETCH_ARTIFACTS");
        this.clear();
      } catch (err) {
        this.$store.commit("SET_ERROR_MESSAGE", `${this.editing ? "更新" : "创建"}配置失败！${err}`);
      }
    },

    async editArtifact(artifact) {
      this.editing = true;
      Object.assign(this.currentArtifact, artifact);
      this.showArtifactDialog = true;
    },

    async toggleSync(artifact) {
      artifact.sync = !artifact.sync;
      try {
        await axios.patch(`/artifact/${artifact.name}`, artifact);
        await this.$store.dispatch("FETCH_ARTIFACTS");
        this.$store.commit("SET_SUCCESS_MESSAGE", `已${artifact.sync ? '启用' : '禁用'}自动同步配置${artifact.name}`);
      } catch (err) {
        this.$store.commit("SET_ERROR_MESSAGE", `更改同步配置失败！${err}`);
      }
    },

    async deleteArtifact(idx, name) {
      try {
        await axios.delete(`/artifact/${name}`);
        await this.$store.dispatch("FETCH_ARTIFACTS");
      } catch (err) {
        this.$store.commit("SET_ERROR_MESSAGE", `删除配置失败！${err}`);
      }
    },

    clear() {
      this.currentArtifact = {
        name: "",
        type: "subscription",
        source: "",
        platform: ""
      }
      this.showArtifactDialog = false;
      this.editing = false;
    },

    copy(url) {
      this.$clipboard(url);
      this.$store.commit("SET_SUCCESS_MESSAGE", "成功复制配置链接");
    },

    preview(name) {
      window.open(`${BACKEND_BASE}/api/artifact/${name}?action=preview`);
    },

    async sync(name) {
      this.$store.commit("SET_LOADING", true);
      try {
        await axios.get(`/artifact/${name}?action=sync`);
        await this.$store.dispatch("FETCH_ARTIFACTS");
        this.$store.commit("SET_SUCCESS_MESSAGE", `同步配置成功！`);
      } catch (err) {
        this.$store.commit("SET_ERROR_MESSAGE", `同步配置失败！${err}`);
      } finally {
        this.$store.commit("SET_LOADING", false);
      }
    },

    setArtifactType(type) {
      this.currentArtifact.type = type;
      this.currentArtifact.source = "";
    },

    getSources(type) {
      let data;
      switch (type) {
        case "subscription":
          data = this.$store.state.subscriptions;
          break;
        case "collection":
          data = this.$store.state.collections;
      }
      return Object.keys(data).map(k => data[k]);
    },

    getIconClass(url) {
      return url.indexOf('#invert') !== -1 && !this.$store.state.settings.theme.darkMode ? 'invert' : ''
    },

    openGist() {
      window.open(`https://gist.github.com${'/' + this.settings.githubUser || ''}`)
    }
  }
}
</script>

<style scoped>
.invert {
  filter: invert(100%);
}
</style>