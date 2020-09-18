<template>
<!--  <v-card-->
<!--      class="ml-4 mt-4 mb-4 mr-4"-->
<!--  >-->
<!--    <v-card-title>Nexitally</v-card-title>-->
<!--    <v-carousel-->
<!--        cycle-->
<!--        height="250"-->
<!--        :show-arrows="false"-->
<!--    >-->
<!--      <v-carousel-item>-->
<!--        <v-chart-->
<!--            :options="pie"-->
<!--            class="remains !important"-->
<!--            autoresize-->
<!--        />-->
<!--      </v-carousel-item>-->
<!--      <v-carousel-item>-->
<!--        <v-chart-->
<!--            :options="pie"-->
<!--            class="remains !important"-->
<!--            autoresize-->
<!--        />-->
<!--      </v-carousel-item>-->
<!--    </v-carousel>-->
<!--  </v-card>-->
  <v-container></v-container>
</template>

<script>
import ECharts from 'vue-echarts';
import 'echarts/lib/chart/pie';

export default {
  name: "Dashboard",
  components: {
    // eslint-disable-next-line vue/no-unused-components
    "v-chart": ECharts
  },
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