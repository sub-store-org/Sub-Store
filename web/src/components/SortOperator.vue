<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>sort_by_alpha</v-icon>
      节点排序
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
            节点排序
          </v-card-title>
          <v-card-text>
            根据节点名排序，一共有正序，逆序，随机三种模式。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      模式
      <v-radio-group v-model="mode">
        <v-row>
          <v-col>
            <v-radio label="正序" value="asc"/>
          </v-col>
          <v-col>
            <v-radio label="逆序" value="desc"/>
          </v-col>
          <v-col>
            <v-radio label="随机" value="random"/>
          </v-col>
        </v-row>
      </v-radio-group>
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  props: ["args"],
  data: function () {
    return {
      idx: this.$vnode.key,
      mode: "asc"
    }
  },
  created() {
    this.mode = this.args;
  },
  watch: {
    mode() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: this.mode
      })
    }
  }

}
</script>

<style scoped>

</style>