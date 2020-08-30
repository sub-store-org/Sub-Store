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
        <v-btn icon @click="save"><v-icon>save_alt</v-icon></v-btn>
        <v-btn icon @click="discard"><v-icon>settings_backup_restore</v-icon></v-btn>
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
            </v-row>
          </v-radio-group>
          <v-radio-group
              v-model="options.flag"
              dense
              class="mt-0 mb-0"
          >
            国旗
            <v-row>
              <v-col>
                <v-radio label="默认" value="DEFAULT"/>
              </v-col>
              <v-col>
                <v-radio label="添加国旗" value="ADD"/>
              </v-col>
              <v-col>
                <v-radio label="删除国旗" value="REMOVE"/>
              </v-col>
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
    <v-card class="mb-4">
      <v-subheader>
        节点操作
        <v-spacer></v-spacer>
        <v-btn icon>
          <v-icon color="primary">add_circle</v-icon>
        </v-btn>
      </v-subheader>
      <v-divider></v-divider>
    </v-card>
  </v-container>
</template>

<script>
import {showError, showInfo} from "@/utils";

export default {
  data: function () {
    return {
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
        flag: "DEFAULT",
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
    }
  }
}

function loadSubscription(options, sub) {
  options = {
    ...options,
    name: sub.name,
    url: sub.url
  }
  // flag
  for (const p of (sub.process || [])) {
    switch (p.type) {
      case 'Useless Filter':
        options.useless = "REMOVE";
        break
      case 'Flag Operator':
        options.flag = p.args[0] ? "ADD" : "REMOVE";
        break
      case 'Set Property Operator':
        options[p.args[0]] = p.args[1] ? "FORCE_OPEN" : "FORCE_CLOSE";
        break
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
  // flag
  if (options.flag !== 'DEFAULT') {
    sub.process.push({
      type: "Flag Operator",
      args: [options.flag === 'ADD']
    });
  }
  // udp, tfo, scert
  for (const opt of ['udp', 'tfo', 'scert']) {
    if (options[opt] !== 'DEFAULT') {
      sub.process.push({
        type: "Set Property Operator",
        args: [opt, options[opt] === 'FORCE_OPEN']
      });
    }
  }
  // for (const p of options.process) {
  //
  // }
  return sub;
}
</script>

<style>
.v-label {
  font-size: small;
}
</style>