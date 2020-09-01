<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon left color="primary">filter_list</v-icon>
      关键词删除
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
            关键词删除
          </v-card-title>
          <v-card-text>
            删除节点名中的关键词
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
            v-for="(keyword, idx) in keywords"
            :key="idx"
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