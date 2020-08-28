<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon left color="primary">sort</v-icon>
      关键词排序
      <v-spacer></v-spacer>
      <v-btn icon>
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
            根据给出的关键词的顺序对节点进行排序。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      关键词
      <v-chip-group column
      >
        <v-chip
            draggable
            close
            close-icon="mdi-delete"
            v-for="(keyword, idx) in keywords"
            :key="idx"
            @click:close="remove(idx)"
            @dragstart="dragStart"
            @dragend="dragEnd"
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
  data: function () {
    return {
      selection: null,
      currentTag: null,
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
    remove(idx) {
      this.keywords.splice(idx, 1);
    },
    dragStart() {
      if (this.keywords[this.selection]) this.currentTag = this.tags[this.selection].name;
      else this.currentTag = null;
    },
    dragEnd() {
      const self = this;
      if (this.currentTag) {
        this.keywords.forEach((x, i) => {
          if (x.name === self.currentTag) self.selection = i;
        });
      }
    }
  }
}
</script>

<style scoped>

</style>