<template>
  <v-list>
    <v-list-item v-for="(proxy, idx) in proxies" :key="idx">
      <v-list-item-content>
        <v-list-item-title class="wrap-text" v-text="proxy.name"></v-list-item-title>
        <v-chip-group>
          <v-chip color="primary" outlined x-small>
            <v-icon left x-small>mdi-server</v-icon>
            {{ proxy.type.toUpperCase() }}
          </v-chip>
          <v-chip v-if="proxy.udp" color="blue" outlined x-small>
            <v-icon left x-small>mdi-fire</v-icon>
            UDP
          </v-chip>
          <v-chip v-if="proxy.tfo" color="success" outlined x-small>
            <v-icon left x-small>mdi-flash</v-icon>
            TFO
          </v-chip>
          <v-chip v-if="proxy['skip-cert-verify']" color="error" outlined x-small>
            <v-icon left x-small>error</v-icon>
            SCERT
          </v-chip>
        </v-chip-group>
      </v-list-item-content>
      <v-list-item-action>
        <v-row>
          <v-col>
            <v-btn
                v-if="proxy.type !== 'http'"
                icon
                @click="showQRCode(idx)"
            >
              <v-icon color="grey lighten-1" small>mdi-qrcode</v-icon>
            </v-btn>
          </v-col>
          <v-col>
            <v-btn icon @click="showInfo(idx)">
              <v-icon color="grey lighten-1" small>mdi-information</v-icon>
            </v-btn>
          </v-col>
        </v-row>
      </v-list-item-action>
    </v-list-item>
    <v-dialog
        v-model="dialog"
    >
      <v-card>
        <v-card-title>
          {{ info.name }}
        </v-card-title>

        <v-card-text>
          <h4>{{ info.isp }}</h4>
          <h4>{{ info.region }}</h4>
          <h4>{{ info.ip }}</h4>
        </v-card-text>
      </v-card>
    </v-dialog>
    <v-dialog
        v-model="showQR"
    >
      <v-card>
        <v-card-title>
          {{ info.name }}
          <v-btn
              icon
              @click="copyLink()"
          >
            <v-icon>content_copy</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text
            align="center"
        >
          <vue-q-r-code-component
              :text="qr"
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-list>
</template>

<script>
import {axios} from "@/utils";
import VueQRCodeComponent from 'vue-qrcode-component';

const flags = new Map([["AC", "🇦🇨"], ["AF", "🇦🇫"], ["AI", "🇦🇮"], ["AL", "🇦🇱"], ["AM", "🇦🇲"], ["AQ", "🇦🇶"], ["AR", "🇦🇷"], ["AS", "🇦🇸"], ["AT", "🇦🇹"], ["AU", "🇦🇺"], ["AW", "🇦🇼"], ["AX", "🇦🇽"], ["AZ", "🇦🇿"], ["BB", "🇧🇧"], ["BD", "🇧🇩"], ["BE", "🇧🇪"], ["BF", "🇧🇫"], ["BG", "🇧🇬"], ["BH", "🇧🇭"], ["BI", "🇧🇮"], ["BJ", "🇧🇯"], ["BM", "🇧🇲"], ["BN", "🇧🇳"], ["BO", "🇧🇴"], ["BR", "🇧🇷"], ["BS", "🇧🇸"], ["BT", "🇧🇹"], ["BV", "🇧🇻"], ["BW", "🇧🇼"], ["BY", "🇧🇾"], ["BZ", "🇧🇿"], ["CA", "🇨🇦"], ["CF", "🇨🇫"], ["CH", "🇨🇭"], ["CK", "🇨🇰"], ["CL", "🇨🇱"], ["CM", "🇨🇲"], ["CN", "🇨🇳"], ["CO", "🇨🇴"], ["CP", "🇨🇵"], ["CR", "🇨🇷"], ["CU", "🇨🇺"], ["CV", "🇨🇻"], ["CW", "🇨🇼"], ["CX", "🇨🇽"], ["CY", "🇨🇾"], ["CZ", "🇨🇿"], ["DE", "🇩🇪"], ["DG", "🇩🇬"], ["DJ", "🇩🇯"], ["DK", "🇩🇰"], ["DM", "🇩🇲"], ["DO", "🇩🇴"], ["DZ", "🇩🇿"], ["EA", "🇪🇦"], ["EC", "🇪🇨"], ["EE", "🇪🇪"], ["EG", "🇪🇬"], ["EH", "🇪🇭"], ["ER", "🇪🇷"], ["ES", "🇪🇸"], ["ET", "🇪🇹"], ["EU", "🇪🇺"], ["FI", "🇫🇮"], ["FJ", "🇫🇯"], ["FK", "🇫🇰"], ["FM", "🇫🇲"], ["FO", "🇫🇴"], ["FR", "🇫🇷"], ["GA", "🇬🇦"], ["GB", "🇬🇧"], ["HK", "🇭🇰"], ["HU", "🇭🇺"], ["ID", "🇮🇩"], ["IE", "🇮🇪"], ["IL", "🇮🇱"], ["IM", "🇮🇲"], ["IN", "🇮🇳"], ["IS", "🇮🇸"], ["IT", "🇮🇹"], ["JP", "🇯🇵"], ["KR", "🇰🇷"], ["LU", "🇱🇺"], ["MO", "🇲🇴"], ["MX", "🇲🇽"], ["MY", "🇲🇾"], ["NL", "🇳🇱"], ["PH", "🇵🇭"], ["RO", "🇷🇴"], ["RS", "🇷🇸"], ["RU", "🇷🇺"], ["RW", "🇷🇼"], ["SA", "🇸🇦"], ["SB", "🇸🇧"], ["SC", "🇸🇨"], ["SD", "🇸🇩"], ["SE", "🇸🇪"], ["SG", "🇸🇬"], ["TH", "🇹🇭"], ["TN", "🇹🇳"], ["TO", "🇹🇴"], ["TR", "🇹🇷"], ["TV", "🇹🇻"], ["TW", "🇨🇳"], ["UK", "🇬🇧"], ["UM", "🇺🇲"], ["US", "🇺🇸"], ["UY", "🇺🇾"], ["UZ", "🇺🇿"], ["VA", "🇻🇦"], ["VE", "🇻🇪"], ["VG", "🇻🇬"], ["VI", "🇻🇮"], ["VN", "🇻🇳"], ["ZA", "🇿🇦"]])

export default {
  name: "ProxyList",
  props: ['url', 'sub', 'raw'],
  components: {VueQRCodeComponent},
  data: function () {
    return {
      proxies: [],
      uris: [],
      dialog: false,
      showQR: false,
      info: {
        name: "",
        isp: "",
        region: "",
        ip: ""
      },
      qr: "",
      link: ""
    }
  },
  methods: {
    async refresh() {
      await axios.post(`/utils/refresh`, {url: this.sub});
      await this.fetch();
    },

    async fetch() {
      await axios.get(this.raw ? `${this.url}?raw=true` : this.url).then(resp => {
        let {data} = resp;
        // eslint-disable-next-line no-debugger
        this.proxies = data;
      }).catch(err => {
        this.$store.commit("SET_ERROR_MESSAGE", err);
      });

      await axios.get(this.raw ? `${this.url}?target=URI&raw=true` : `${this.url}?target=URI`).then(resp => {
        const {data} = resp;
        this.uris = data.split("\n");
      });

      // fix http offset
      this.proxies.forEach((p, idx) => {
        if (p.type === 'http') {
          this.uris.splice(idx, 0, null);
        }
      })
    },

    async showInfo(idx) {
      const {server, name} = this.proxies[idx];
      const res = await axios.get(`/utils/IP_API/${encodeURIComponent(server)}`).then(resp => resp.data);
      this.info.name = name;
      this.info.isp = `ISP：${res.isp}`;
      this.info.region = `地区：${flags.get(res.countryCode)} ${res.regionName} ${res.city}`;
      this.info.ip = `IP：${res.query}`
      this.dialog = true
    },

    copyLink() {
      this.$clipboard(this.link);
      this.$store.commit("SET_SUCCESS_MESSAGE", `节点链接已复制到剪贴板！`);
    },

    showQRCode(idx) {
      this.qr = this.uris[idx];
      this.link = this.uris[idx];
      this.info.name = this.proxies[idx].name;
      this.showQR = true;
    }
  },
  created() {
    this.fetch();
  }
}
</script>

<style scoped>
.wrap-text {
  white-space: normal;
}
</style>