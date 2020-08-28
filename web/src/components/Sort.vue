<template>
  <v-card class="ml-1 mr-1 mb-1 mt-1">
    <v-card-title>
      <v-icon left color="primary">sort_by_alpha</v-icon>
      节点排序
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
            <v-radio label="正序" value="ASC"/>
          </v-col>
          <v-col>
            <v-radio label="逆序" value="DESC"/>
          </v-col>
          <v-col>
            <v-radio label="随机" value="RANDOM"/>
          </v-col>
        </v-row>
      </v-radio-group>
    </v-card-text>
  </v-card>
</template>

<script>
export default {
  data: function () {
    return {
      mode: "ASC"
    }
  }
}
</script>

<style scoped>

</style>