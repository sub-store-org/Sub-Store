<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>flag</v-icon>
      区域过滤
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
            区域过滤器
          </v-card-title>
          <v-card-text>
            根据区域过滤节点，至少需要保留一个区域！选中的区域会被保留。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      <v-chip-group v-model="selection" active-class="primary accent-4" column multiple>
        <v-chip
            v-for="region in regions"
            :key="region.name"
            :value="region.value"
            class="ma-2"
            label
        >
          {{ region.name }}
        </v-chip>
      </v-chip-group>
    </v-card-text>
  </v-card>
</template>

<script>
const regions = [
  {
    name: "🇭🇰 香港",
    value: "HK"
  },
  {
    name: "🇨🇳 台湾",
    value: "TW"
  },
  {
    name: "🇸🇬 新加坡",
    value: "SG"
  },
  {
    name: "🇯🇵 日本",
    value: "JP"
  },
  {
    name: "🇺🇸 美国",
    value: "US"
  },
  {
    name: "🇬🇧 英国",
    value: "UK"
  }
];
export default {
  props: ["args"],
  data: function () {
    return {
      idx: this.$vnode.key,
      regions,
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
        args: this.selection
      })
    }
  }
}
</script>

<style scoped>

</style>