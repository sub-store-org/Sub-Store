<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>flag</v-icon>
      国旗
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
            国旗
          </v-card-title>
          <v-card-text>
            添加或者删除节点国旗。
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      工作模式
      <v-radio-group v-model="mode">
        <v-row>
          <v-col>
            <v-radio label="添加" value="ADD"/>
          </v-col>
          <v-col>
            <v-radio label="删除" value="REMOVE"/>
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
      mode: "ADD"
    }
  },
  created() {
    if (typeof this.args !== 'undefined')
      this.mode = this.args === true ? "ADD" : "REMOVE";
  },
  watch: {
    mode() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: this.mode === "ADD"
      })
    }
  }

}
</script>

<style scoped>

</style>