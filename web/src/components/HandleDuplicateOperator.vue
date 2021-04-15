<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>compress</v-icon>
      节点去重
      <v-spacer></v-spacer>
      <v-btn icon @click="$emit('up', idx)">
        <v-icon>keyboard_arrow_up</v-icon>
      </v-btn>
      <v-btn icon @click="$emit('down', idx)">
        <v-icon>keyboard_arrow_down</v-icon>
      </v-btn>
      <v-btn icon @click="$emit('deleteProcess', idx)">
        <v-icon color="error">mdi-delete</v-icon>
      </v-btn>
      <v-dialog>
        <template #activator="{ on }">
          <v-btn v-on="on" icon>
            <v-icon>help</v-icon>
          </v-btn>
        </template>
        <v-card>
          <v-card-title class="headline">节点去重</v-card-title>
          <v-card-text>
            删除或者重命名重复节点。提供以下两种选项：<br/>
            - 删除：删除多余重复节点。<br/>
            - 重命名：对重复节点添加序号进行重命名。可以定制序号显示的格式
            (用空格分割的数字)，序号位置 (前缀或者后缀)，连接符。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      操作
      <v-radio-group v-model="action">
        <v-row>
          <v-col>
            <v-radio label="重命名" value="rename"/>
          </v-col>
          <v-col>
            <v-radio label="删除" value="delete"/>
          </v-col>
        </v-row>
      </v-radio-group>

      <v-form v-if="action === 'rename'">
        序号位置
        <v-radio-group v-model="position" row>
          <v-radio label="前缀" value="front"/>
          <v-radio label="后缀" value="back"/>
        </v-radio-group>
        序号格式
        <v-text-field
            v-model="template"
            clear-icon="clear"
            clearable
            hint="例如：𝟘 𝟙 𝟚 𝟛 𝟜 𝟝 𝟞 𝟟 𝟠 𝟡"
            placeholder="序号显示格式，用空格分隔"
        />
        连接符
        <v-text-field
            v-model="link"
            clear-icon="clear"
            clearable
            hint="例如：-"
            placeholder="节点名和序号的连接符"
        />
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  props: ["args"],
  data: function () {
    return {
      idx: this.$vnode.key,
      action: "rename",
      position: "back",
      template: "0 1 2 3 4 5 6 7 8 9",
      link: "-",
    };
  },
  computed: {
    attr() {
      return `${this.action}/${this.position}/${this.template}${this.link}`;
    },
  },
  methods: {
    save() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: {
          action: this.action,
          position: this.position,
          template: this.template,
          link: this.link,
        },
      });
    },
  },
  watch: {
    attr() {
      this.save();
    },
  },
};
</script>

<style scoped>
</style>