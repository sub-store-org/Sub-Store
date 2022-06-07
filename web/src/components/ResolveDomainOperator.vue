<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon color="primary" left>dns</v-icon>
      节点域名解析
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
            节点域名解析
          </v-card-title>
          <v-card-text>
            将节点域名解析成 IP 地址
          </v-card-text>
        </v-card>
      </v-dialog>
    </v-card-title>
    <v-card-text>
      服务提供商
      <v-radio-group v-model="provider">
        <v-row>
          <v-col>
            <v-radio label="Google" value="Google"/>
          </v-col>
          <v-col>
            <v-radio label="IP-API" value="IP-API"/>
          </v-col>
          <v-col>
            <v-radio label="Cloudflare" value="Cloudflare"/>
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
      provider: "Google"
    }
  },
  created() {
    if (typeof this.args !== "undefined") {
      this.provider = this.args.provider || "Google";
    }
  },
  methods: {
    save() {
      this.$emit("dataChanged", {
        idx: this.idx,
        args: {
          provider: this.provider
        }
      });
    },
  },
  watch: {
    provider() {
      this.save();
    }
  }

}
</script>

<style scoped>

</style>