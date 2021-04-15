<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>code</v-icon>
      脚本操作
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
        <template #activator="{on}">
          <v-btn v-on="on" icon>
            <v-icon>help</v-icon>
          </v-btn>
        </template>
        <v-card>
          <v-card-title class="headline">
            脚本操作
          </v-card-title>
          <v-card-text>
            用一段脚本操作节点，可以提供脚本链接或者直接输入脚本。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      输入
      <v-radio-group v-model="mode">
        <v-row>
          <v-col>
            <v-radio label="链接" value="link"/>
          </v-col>
          <v-col>
            <v-radio label="脚本" value="script"/>
          </v-col>
        </v-row>
      </v-radio-group>
      <v-textarea
          v-model="content"
          :label="hint"
          auto-grow
          clear-icon="clear"
          clearable
          solo
      />
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  props: ["args"],
  data: function () {
    return {
      idx: this.$vnode.key,
      mode: "link",
      content: ""
    }
  },
  computed: {
    hint() {
      return this.mode === 'link' ? "请输入链接地址" : "请输入一段脚本"
    }
  },
  created() {
    if (typeof this.args !== 'undefined') {
      this.mode = this.args.mode;
      this.content = this.args.content;
    }
  },
  watch: {
    mode() {
      this.save();
    },
    content() {
      this.save();
    }
  },
  methods: {
    save() {
      if (this.content) {
        this.$emit("dataChanged", {
          idx: this.idx,
          args: {
            mode: this.mode,
            content: this.content
          }
        });
      }
    }
  }
}
</script>

<style scoped>

</style>