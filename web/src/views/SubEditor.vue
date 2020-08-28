<template>
  <v-container>
    <v-card class="mb-4">
      <v-subheader>基本信息</v-subheader>
      <v-form class="pl-4 pr-4 pb-4" v-model="formState.basicValid">
        <v-text-field
            v-model="options.name"
            class="mt-2"
            :rules="validations.nameRules"
            required
            label="订阅名称"
            placeholder="填入订阅名称，名称需唯一"
        />
        <v-text-field
            v-model="options.url"
            class="mt-2"
            :rules="validations.urlRules"
            required
            label="订阅链接"
            placeholder="填入机场原始订阅链接"
        />
      </v-form>
    </v-card>
    <v-card class="mb-4">
      <v-subheader>常用选项</v-subheader>
      <v-form class="pl-4 pr-4">
        <v-item-group>
          <v-radio-group
              v-model="options.flag"
              dense
              class="mt-0 mb-0"
          >
            国旗
            <v-row>
              <v-col>
                <v-radio label="添加国旗" value="ADD"/>
              </v-col>
              <v-col>
                <v-radio label="删除国旗" value="REMOVE"/>
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
            证书验证
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
      <region-filter/>
      <keyword-filter/>
      <regex-filter/>
      <sort></sort>
      <keyword-sort></keyword-sort>
    </v-card>
  </v-container>
</template>

<script>
// const operations = [
//   {
//     type: "Region Filter",
//     name: "区域过滤",
//     desc: "按照区域过滤节点",
//   }
// ];

import RegionFilter from "@/components/RegionFilter";
import KeywordFilter from "@/components/KeywordFilter";
import RegexFilter from "@/components/RegexFilter";
import Sort from "@/components/Sort";
import KeywordSort from "@/components/KeywordSort";
export default {
  components: {KeywordSort, Sort, RegexFilter, KeywordFilter, RegionFilter},
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
        udp: "DEFAULT",
        flag: "ADD",
        scert: "DEFAULT",
        tfo: "DEFAULT",
        process: [],
      }
    }
  },
  watch: {
    options: {
      handler(opt) {
        if (this.formState.basicValid) {
          console.log(`FORM UPDATED: ${JSON.stringify(opt)}`)
        }
      },
      deep: true
    }
  },
  created() {
    const name = this.$route.params.name;
    const sub = (!!name || name === 'UNTITLED') ? {} : this.$store.state.subscriptions[name];
    this.$store.commit("SET_NAV_TITLE", sub.name ? `订阅编辑 -- ${sub.name}` : "新建订阅");
    this.options = {
      ...this.options,
      name: sub.name,
      url: sub.url,
      udp: "DEFAULT",
      flag: "ADD",
      scert: "DEFAULT",
      tfo: "DEFAULT"
    }
  }
}
</script>

<style>
.v-label {
  font-size: small;
}
</style>