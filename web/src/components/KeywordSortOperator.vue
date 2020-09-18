<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon left color="primary">sort</v-icon>
      关键词排序
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
            关键词排序
          </v-card-title>
          <v-card-text>
            根据给出的关键词的顺序对节点进行排序，没有出现的关键词将会按照正序排列。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      关键词
      <v-chip-group column
      >
        <v-chip
            close
            close-icon="mdi-delete"
            v-for="(keyword, idx) in keywords"
            :key="idx"
            @click="edit(idx)"
            @click:close="remove(idx)"
        >
          {{ keyword }}
        </v-chip>
      </v-chip-group>
      <v-text-field
          placeholder="添加新关键词"
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
      selection: null,
      currentTag: null,
      form: {
        keyword: ""
      },
      keywords: []
    }
  },
  created() {
    if (this.args) {
      this.keywords = this.args || [];
    }
  },
  watch: {
    keywords() {
      this.save();
    },
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
        args: this.keywords
      });
    },
  }
}
</script>

<style scoped>

</style>