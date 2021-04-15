<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>cloud_circle</v-icon>
      节点类型过滤
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
            节点类型过滤器
          </v-card-title>
          <v-card-text>
            根据节点类型过滤节点，至少需要保留一种类型！选中的类型会被保留。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      <v-chip-group v-model="selection" active-class="primary accent-4" column multiple>
        <v-chip
            v-for="type in types"
            :key="type.name"
            :value="type.value"
            class="ma-2"
            label
        >
          {{ type.name }}
        </v-chip>
      </v-chip-group>
    </v-card-text>
  </v-card>
</template>

<script>
const types = [
  {
    name: "Shadowsocks",
    value: "ss"
  },
  {
    name: "Shadowsocks R",
    value: "ssr"
  },
  {
    name: "V2Ray",
    value: "vmess"
  },
  {
    name: "Trojan",
    value: "trojan"
  },
  {
    name: "HTTP",
    value: "http"
  }
];
export default {
  props: ['args'],
  data: function () {
    return {
      idx: this.$vnode.key,
      types,
      selection: []
    }
  },
  created() {
    this.selection = this.args || [];
  },
  watch: {
    selection() {
      this.$emit("dataChanged", {
        idx: this.idx,
        type: "Type Filter",
        args: this.selection
      })
    }
  }
}
</script>

<style scoped>

</style>