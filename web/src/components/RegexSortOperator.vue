<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>sort</v-icon>
      正则排序
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
            正则排序
          </v-card-title>
          <v-card-text>
            根据给出的正则表达式的顺序对节点进行排序，无法匹配的节点将会按照正序排列。
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
            v-for="(item, idx) in items"
            :key="idx"
            close
            close-icon="mdi-delete"
            @click="edit(idx)"
            @click:close="remove(idx)"
        >
          {{ item }}
        </v-chip>
      </v-chip-group>
      <v-text-field
          v-model="form.item"
          append-icon="mdi-send"
          clear-icon="clear"
          clearable
          placeholder="添加新正则表达式"
          solo
          @click:append="add(form.item)"
          @keyup.enter="add(form.item)"
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
        item: ""
      },
      items: []
    }
  },
  created() {
    if (this.args) {
      this.items = this.args || [];
    }
  },
  watch: {
    items() {
      this.save();
    },
  },
  methods: {
    add(item) {
      if (item) {
        this.items.push(item);
        this.form.item = "";
      } else {
        this.$store.commit("SET_ERROR_MESSAGE", "正则表达式不能为空！");
      }
    },
    edit(idx) {
      this.form.item = this.items[idx];
      this.remove(idx);
    },
    remove(idx) {
      this.items.splice(idx, 1);
    },
    save() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: this.items
      });
    },
  }
}
</script>

<style scoped>

</style>