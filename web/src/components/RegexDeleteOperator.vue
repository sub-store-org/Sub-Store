<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>code</v-icon>
      正则删除
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
            正则删除
          </v-card-title>
          <v-card-text>
            根据正则表达式删除节点名中的字段，注意正则表达式需要注意转义。
            <br/>这里是一个合法的正则表达式:
            <br/>
            <b>IEPL|IPLC</b>
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      正则表达式
      <v-chip-group
          column
      >
        <v-chip
            v-for="(regex, idx) in regexps"
            :key="idx"
            close
            close-icon="mdi-delete"
            @click="edit(idx)"
            @click:close="remove(idx)"
        >
          {{ regex }}
        </v-chip>
      </v-chip-group>
      <v-text-field
          v-model="form.regex"
          append-icon="mdi-send"
          clear-icon="clear"
          clearable
          placeholder="添加新正则表达式"
          solo
          @click:append="add(form.regex)"
          @keyup.enter="add(form.regex)"
      />
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  props: ['args'],
  data: function () {
    return {
      mode: "IN",
      form: {
        regex: ""
      },
      regexps: [],
      idx: this.$vnode.key,
    }
  },
  methods: {
    add(keyword) {
      if (keyword) {
        this.regexps.push(keyword);
        this.form.regex = "";
      } else {
        this.$store.commit("SET_ERROR_MESSAGE", "正则表达式不能为空！");
      }
    },
    edit(idx) {
      this.form.regex = this.regexps[idx];
      this.remove(idx);
    },
    remove(idx) {
      this.regexps.splice(idx, 1);
    },
    save() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: this.regexps
      });
    }
  },
  watch: {
    regexps() {
      this.save();
    }
  },
  created() {
    this.regexps = this.args || [];
  }
}
</script>

<style scoped>

</style>