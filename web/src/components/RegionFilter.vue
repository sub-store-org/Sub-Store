<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon left color="primary">flag</v-icon>
      区域过滤
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
            区域过滤器
          </v-card-title>
          <v-card-text>
            根据区域过滤节点，不选则默认保留所有节点。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      <v-chip-group multiple active-class="primary accent-4" v-model="selection" column>
        <v-chip
            class="ma-2"
            v-for="region in regions"
            label
            :key="region.name"
            :value="region.value"
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
    value: "USA"
  },
  {
    name: "🇬🇧 英国",
    value: "UK"
  }
];
export default {
  data: function () {
    return {
      regions,
      selection: []
    }
  }
}
</script>

<style scoped>

</style>