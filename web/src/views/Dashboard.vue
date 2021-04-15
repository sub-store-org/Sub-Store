<template>
  <v-container></v-container>
</template>

<script>
export default {
  name: "Dashboard",
  components: {},
  computed: {
    pie() {
      const total = 400;
      const upload = 30;
      const download = 200;
      const remaining = total - (upload + download);
      return {
        series: [
          {
            name: "流量",
            type: "pie",
            radius: "50%",
            data: [
              {
                name: `剩余量\n${(remaining)} GB`,
                value: remaining
              },
              {
                name: `下载量\n${(download)} GB`,
                value: download
              },
              {
                name: `上传量\n${(upload)} GB`,
                value: upload
              }
            ]
          }
        ],
        animationEasing: 'elasticOut'
      };
    }
  }
}
</script>

<style>
.remains {
  width: 100%;
  height: 200px; /* or e.g. 400px */
}
</style>