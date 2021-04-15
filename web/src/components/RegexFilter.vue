<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>filter_list</v-icon>
      正则过滤
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
            正则过滤
          </v-card-title>
          <v-card-text>
            根据正则表达式过滤节点。如果设置为保留模式，则匹配<b>任何一个</b>正则表达式的节点会被保留，否则会被过滤。
            正则表达式需要注意转义。
            <br/>这里是一个合法的正则表达式:
            <br/>
            <b>IEPL|IPLC</b>
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      工作模式
      <v-radio-group v-model="mode">
        <v-row>
          <v-col>
            <v-radio label="保留模式" value="IN"/>
          </v-col>
          <v-col>
            <v-radio label="过滤模式" value="OUT"/>
          </v-col>
        </v-row>
      </v-radio-group>
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
        args: {
          regex: this.regexps,
          keep: this.mode === 'IN'
        }
      });
    }
  },
  watch: {
    regexps() {
      this.save();
    },
    mode() {
      this.save();
    }
  },
  created() {
    if (this.args) {
      this.regexps = this.args.regex || [];
      if (typeof this.args.keep !== 'undefined') this.mode = this.args.keep ? "IN" : "OUT";
      else this.mode = "IN";
    }
  }
}
</script>

<style scoped>

</style>