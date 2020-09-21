<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon left color="primary">filter_list</v-icon>
      关键词重命名
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
          <v-btn icon v-on="on">
            <v-icon>help</v-icon>
          </v-btn>
        </template>
        <v-card>
          <v-card-title class="headline">
            关键词重命名
          </v-card-title>
          <v-card-text>
            替换节点名中的关键词。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      关键词
      <v-chip-group>
        <v-chip
            close
            close-icon="mdi-delete"
            v-for="(chip, idx) in chips"
            :key="idx"
            @click:close="remove(idx)"
            @click="edit(idx)"
        >
          {{ chip }}
        </v-chip>
      </v-chip-group>
      <v-row>
        <v-col>
          <v-text-field
              clearable
              clear-icon="clear"
              placeholder="关键词"
              solo
              v-model="form.keyword"
          />
        </v-col>
        <v-col>
          <v-text-field
              clearable
              clear-icon="clear"
              placeholder="替换为"
              solo
              v-model="form.replace"
              append-icon="mdi-send"
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
        keyword: "",
        replace: ""
      },
      keywords: []
    }
  },
  computed: {
    chips() {
      return this.keywords.map(k => {
        const {old, now} = k;
        return `${old} ⇒ ${now.length === 0 ? "∅" : now}`;
      });
    }
  },
  methods: {
    add() {
      if (this.form.keyword) {
        this.keywords.push({
          old: this.form.keyword,
          now: this.form.replace || ""
        });
        this.form.keyword = "";
        this.form.replace = "";
      } else {
        this.$store.commit("SET_ERROR_MESSAGE", "关键词不能为空！");
      }
    },
    edit(idx) {
      this.form.keyword = this.keywords[idx].old;
      this.form.replace = this.keywords[idx].now;
      this.remove(idx);
    },
    remove(idx) {
      this.keywords.splice(idx, 1);
    },
    save() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: this.keywords
      });
    }
  },
  created() {
    this.keywords = this.args || [];
  },
  watch: {
    keywords() {
      this.save();
    }
  },
}
</script>

<style scoped>

</style>