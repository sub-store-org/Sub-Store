<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>filter_list</v-icon>
      正则重命名
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
            正则重命名
          </v-card-title>
          <v-card-text>
            使用替换节点名中的字段。
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
            v-for="(chip, idx) in chips"
            :key="idx"
            close
            close-icon="mdi-delete"
            @click="edit(idx)"
            @click:close="remove(idx)"
        >
          {{ chip }}
        </v-chip>
      </v-chip-group>
      <v-row>
        <v-col>
          <v-text-field
              v-model="form.regex"
              clear-icon="clear"
              clearable
              placeholder="正则表达式"
              solo
          />
        </v-col>
        <v-col>
          <v-text-field
              v-model="form.replace"
              append-icon="mdi-send"
              clear-icon="clear"
              clearable
              placeholder="替换为"
              solo
              @click:append="add"
              @keyup.enter="add"
          />
        </v-col>
      </v-row>

    </v-card-text>
  </v-card>
</template>

<script>
export default {
  props: ['args'],
  data: function () {
    return {
      idx: this.$vnode.key,
      mode: "IN",
      form: {
        regex: "",
        replace: ""
      },
      regexps: []
    }
  },
  computed: {
    chips() {
      return this.regexps.map(k => {
        const {expr, now} = k;
        return `${expr} ⇒ ${now.length === 0 ? "∅" : now}`;
      });
    }
  },
  methods: {
    add() {
      if (this.form.regex) {
        this.regexps.push({
          expr: this.form.regex,
          now: this.form.replace || ""
        });
        this.form.regex = "";
        this.form.replace = "";
      } else {
        this.$store.commit("SET_ERROR_MESSAGE", "正则表达式不能为空！");
      }
    },
    edit(idx) {
      this.form.regex = this.regexps[idx].expr;
      this.form.replace = this.regexps[idx].now;
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
  created() {
    this.regexps = this.args || [];
  },
  watch: {
    regexps() {
      this.save();
    }
  },
}
</script>

<style scoped>

</style>