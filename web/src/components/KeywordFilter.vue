<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon left color="primary">filter_list</v-icon>
      关键词过滤
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
            关键词过滤
          </v-card-title>
          <v-card-text>
            根据关键词过滤节点。如果设置为保留模式，则含有关键词的节点会被保留，否则会被过滤。
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
      关键词
      <v-chip-group>
        <v-chip
            close
            close-icon="mdi-delete"
            v-for="(keyword, idx) in keywords"
            :key="idx"
            @click:close="remove(idx)"
            @click="edit(idx)"
        >
          {{ keyword }}
        </v-chip>
      </v-chip-group>
      <v-text-field
          placeholder="添加新关键词"
          clearable
          clear-icon="clear"
          solo
          v-model="form.keyword"
          append-icon="mdi-send"
          @click:append="add(form.keyword)"
          @keyup.enter="add(form.keyword)"
      />
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
        keyword: ""
      },
      keywords: []
    }
  },
  methods: {
    add(keyword) {
      if (keyword) {
        this.keywords.push(keyword);
        this.form.keyword = "";
      } else {
        this.$store.commit("SET_ERROR_MESSAGE", "关键词不能为空！");
      }
    },
    edit(idx) {
      this.form.keyword = this.keywords[idx];
      this.remove(idx);
    },
    remove(idx) {
      this.keywords.splice(idx, 1);
    },
    save() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: {
          keywords: this.keywords,
          keep: this.mode === 'IN'
        }
      });
    }
  },
  created() {
    if (this.args) {
      this.keywords = this.args.keywords || [];
      if (typeof this.args.keep !== 'undefined') this.mode = this.args.keep ? "IN" : "OUT";
      else this.mode = "IN";
    }
  },
  watch: {
    mode() {
      this.save();
    },
    keywords() {
      this.save();
    }
  },
}
</script>

<style scoped>

</style>