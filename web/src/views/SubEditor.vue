<template>
  <v-container>
    <v-card class="mb-4">
      <v-subheader>基本信息</v-subheader>
      <v-form class="pl-4 pr-4 pb-0" v-model="formState.basicValid">
        <v-text-field
            v-model="options.name"
            class="mt-2"
            :rules="validations.nameRules"
            required
            label="订阅名称"
            placeholder="填入订阅名称，名称需唯一"
        />
        <v-textarea
            v-model="options.url"
            class="mt-2"
            rows="2"
            :rules="validations.urlRules"
            required
            label="订阅链接"
            placeholder="填入机场原始订阅链接"
        />
      </v-form>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn icon @click="save">
          <v-icon>save_alt</v-icon>
        </v-btn>
        <v-btn icon @click="discard">
          <v-icon>settings_backup_restore</v-icon>
        </v-btn>
      </v-card-actions>
    </v-card>
    <v-card class="mb-4">
      <v-subheader>常用选项</v-subheader>
      <v-form class="pl-4 pr-4">
        <v-item-group>
          <v-radio-group
              v-model="options.useless"
              dense
              class="mt-0 mb-0"
          >
            过滤非法节点
            <v-row>
              <v-col>
                <v-radio label="保留" value="KEEP"/>
              </v-col>
              <v-col>
                <v-radio label="删除" value="REMOVE"/>
              </v-col>
              <v-col></v-col>
            </v-row>
          </v-radio-group>

          <v-radio-group
              v-model="options.udp"
              dense
              class="mt-0 mb-0"
          >
            UDP转发
            <v-row>
              <v-col>
                <v-radio label="默认" value="DEFAULT"/>
              </v-col>
              <v-col>
                <v-radio label="强制开启" value="FORCE_OPEN"/>
              </v-col>
              <v-col>
                <v-radio label="强制关闭" value="FORCE_CLOSE"/>
              </v-col>
            </v-row>
          </v-radio-group>

          <v-radio-group
              v-model="options.scert"
              dense
              class="mt-0 mb-0"
          >
            跳过证书验证
            <v-row>
              <v-col>
                <v-radio label="默认" value="DEFAULT"/>
              </v-col>
              <v-col>
                <v-radio label="强制跳过" value="FORCE_OPEN"/>
              </v-col>
              <v-col>
                <v-radio label="强制验证" value="FORCE_CLOSE"/>
              </v-col>
            </v-row>
          </v-radio-group>
          <v-radio-group
              v-model="options.tfo"
              dense
              class="mt-0 mb-0"
          >
            TCP Fast Open
            <v-row>
              <v-col>
                <v-radio label="默认" value="DEFAULT"/>
              </v-col>
              <v-col>
                <v-radio label="强制开启" value="FORCE_OPEN"/>
              </v-col>
              <v-col>
                <v-radio label="强制关闭" value="FORCE_CLOSE"/>
              </v-col>
            </v-row>
          </v-radio-group>
        </v-item-group>
      </v-form>
    </v-card>
    <v-card class="mb-4" id="processors">
      <v-subheader>
        节点操作
        <v-spacer></v-spacer>
        <v-dialog scrollable v-model="dialog">
          <template #activator="{on}">
            <v-btn icon v-on="on">
              <v-icon color="primary">add_circle</v-icon>
            </v-btn>
          </template>
          <v-card>
            <v-card-title>选择节点操作</v-card-title>
            <v-divider></v-divider>
            <v-card-text>
              <v-radio-group dense v-model="selectedProcess">
                <v-radio v-for="(k, idx) in Object.keys(availableProcessors)" :label="availableProcessors[k].name"
                         :key="idx" :value="k"></v-radio>
              </v-radio-group>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="primary" text @click="addProcess(selectedProcess)">确认</v-btn>
              <v-btn text @click="dialog = false">取消</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

      </v-subheader>
      <v-divider></v-divider>
      <component v-for="(p, idx) in processors"
                 :is="p.component"
                 :key="idx"
                 :args="p.args"
                 @dataChanged="dataChanged"
                 @deleteProcess="deleteProcess"
                 @up="moveUp"
                 @down="moveDown"
      >
      </component>
    </v-card>
  </v-container>
</template>

<script>
import {showError, showInfo} from "@/utils";
import TypeFilter from "@/components/TypeFilter";
import RegionFilter from "@/components/RegionFilter";
import KeywordFilter from "@/components/KeywordFilter";
import RegexFilter from "@/components/RegexFilter";
import SortOperator from "@/components/SortOperator";
import KeywordRenameOperator from "@/components/KeywordRenameOperator";
import RegexRenameOperator from "@/components/RegexRenameOperator";
import KeywordDeleteOperator from "@/components/KeywordDeleteOperator";
import RegexDeleteOperator from "@/components/RegexDeleteOperator";
import FlagOperator from "@/components/FlagOperator";
import ScriptFilter from "@/components/ScriptFilter";
import ScriptOperator from "@/components/ScriptOperator";

const AVAILABLE_PROCESSORS = {
  "Flag Operator": {
    component: "FlagOperator",
    name: "国旗"
  },
  "Type Filter": {
    component: "TypeFilter",
    name: "类型过滤器"
  },
  "Region Filter": {
    component: "RegionFilter",
    name: "区域过滤器"
  },
  "Keyword Filter": {
    component: "KeywordFilter",
    name: "关键词过滤器"
  },
  "Regex Filter": {
    component: "RegexFilter",
    name: "正则过滤器"
  },
  "Sort Operator": {
    component: "SortOperator",
    name: "节点排序"
  },
  "Keyword Rename Operator": {
    component: "KeywordRenameOperator",
    name: "关键词重命名"
  },
  "Regex Rename Operator": {
    component: "RegexRenameOperator",
    name: "正则重命名"
  },
  "Keyword Delete Operator": {
    component: "KeywordDeleteOperator",
    name: "删除关键词"
  },
  "Regex Delete Operator": {
    component: "RegexDeleteOperator",
    name: "删除正则"
  },
  "Script Filter": {
    component: "ScriptFilter",
    name: "脚本过滤器"
  },
  "Script Operator": {
    component: "ScriptOperator",
    name: "脚本操作"
  }
}

export default {
  components: {
    FlagOperator,
    KeywordFilter,
    RegexFilter,
    RegionFilter,
    TypeFilter,
    SortOperator,
    KeywordRenameOperator,
    RegexRenameOperator,
    KeywordDeleteOperator,
    RegexDeleteOperator,
    ScriptFilter,
    ScriptOperator
  },
  data: function () {
    return {
      selectedProcess: null,
      dialog: false,
      validations: {
        nameRules: [
          v => !!v || "订阅名称不能为空！",
          v => /^[\w-_]*$/.test(v) || "订阅名称只能包含英文字符、横杠和下划线！"
        ],
        urlRules: [
          v => !!v || "订阅链接不能为空！",
          v => /^https?:\/\//.test(v) || "订阅链接不合法！"
        ]
      },
      formState: {
        basicValid: false
      },
      options: {
        name: "",
        url: "",
        useless: "KEEP",
        udp: "DEFAULT",
        scert: "DEFAULT",
        tfo: "DEFAULT",
        process: [],
      }
    }
  },
  created() {
    const name = this.$route.params.name;
    const sub = (typeof name === 'undefined' || name === 'UNTITLED') ? {} : this.$store.state.subscriptions[name];
    this.$store.commit("SET_NAV_TITLE", sub.name ? `订阅编辑 -- ${sub.name}` : "新建订阅");
    this.options = loadSubscription(this.options, sub);
  },
  computed: {
    availableProcessors() {
      return AVAILABLE_PROCESSORS;
    },

    processors() {
      return this.options.process.map(p => {
        return {
          component: AVAILABLE_PROCESSORS[p.type].component,
          args: p.args
        }
      });
    }
  },
  methods: {
    save() {
      if (this.options.name && this.options.url) {
        const sub = buildSubscription(this.options);
        if (this.$route.params.name !== "UNTITLED") {
          this.$store.dispatch("UPDATE_SUBSCRIPTION", {
            name: this.$route.params.name,
            sub
          }).then(() => {
            showInfo(`成功保存订阅：${this.options.name}！`)
          }).catch(() => {
            showError(`发生错误，无法保存订阅！`)
          });
        } else {
          this.$store.dispatch("NEW_SUBSCRIPTION", sub).then(() => {
            showInfo(`成功创建订阅：${this.options.name}！`)
          }).catch(() => {
            showError(`发生错误，无法创建订阅！`)
          });
        }
      }
    },

    discard() {
      this.$router.back();
    },

    dataChanged(content) {
      const process = this.options.process[content.idx];
      process.args = content.args;
      this.options.process.splice(content.idx, 1, process);
    },

    addProcess(type) {
      this.options.process.push({type});
      this.dialog = false;
    },

    deleteProcess(key) {
      this.options.process.splice(key, 1);
    },

    moveUp(index) {
      if (index === 0) return;
      // otherwise swap with previous one
      this.options.process.splice(index - 1, 2, this.options.process[index], this.options.process[index - 1]);
    },

    moveDown(index) {
      if (index === this.options.process.length) return;
      // otherwise swap with latter one
      this.options.process.splice(index, 2, this.options.process[index + 1], this.options.process[index]);
    }
  }
}

function loadSubscription(options, sub) {
  options = {
    ...options,
    name: sub.name,
    url: sub.url,
    process: []
  }
  // flag
  for (const p of (sub.process || [])) {
    switch (p.type) {
      case 'Useless Filter':
        options.useless = "REMOVE";
        break
      case 'Set Property Operator':
        options[p.args.key] = p.args.value ? "FORCE_OPEN" : "FORCE_CLOSE";
        break
      default:
        options.process.push(p);
    }
  }
  return options;
}

function buildSubscription(options) {
  const sub = {
    name: options.name,
    url: options.url,
    process: []
  };
  // useless filter
  if (options.useless === 'REMOVE') {
    sub.process.push({
      type: "Useless Filter"
    });
  }
  // udp, tfo, scert
  for (const opt of ['udp', 'tfo', 'scert']) {
    if (options[opt] !== 'DEFAULT') {
      sub.process.push({
        type: "Set Property Operator",
        args: {key: opt, value: options[opt] === 'FORCE_OPEN'}
      });
    }
  }
  for (const p of options.process) {
    sub.process.push(p);
  }
  return sub;
}
</script>

<style>
.v-label {
  font-size: small;
}
</style>