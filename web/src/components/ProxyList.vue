<template>
  <v-list>
    <v-list-item v-for="(proxy, idx) in proxies" :key="idx">
      <v-list-item-content>
        <v-list-item-title v-text="proxy.name" class="wrap-text"></v-list-item-title>
        <v-chip-group>
          <v-chip x-small color="primary" outlined>
            <v-icon left x-small>mdi-server</v-icon>
            {{ proxy.type.toUpperCase() }}
          </v-chip>
          <v-chip x-small v-if="proxy.udp" color="blue" outlined>
            <v-icon left x-small>mdi-fire</v-icon>
            UDP
          </v-chip>
          <v-chip x-small v-if="proxy.tfo" color="success" outlined>
            <v-icon left x-small>mdi-flash</v-icon>
            TFO
          </v-chip>
          <v-chip x-small v-if="proxy.scert" color="error" outlined>
            <v-icon left x-small>error</v-icon>
            SCERT
          </v-chip>
        </v-chip-group>
      </v-list-item-content>
      <v-list-item-action>
        <v-row>
          <v-col>
            <v-btn
                icon
                @click="showQRCode(idx)"
                v-if="proxy.type !== 'http'"
            >
              <v-icon small color="grey lighten-1">mdi-qrcode</v-icon>
            </v-btn>
          </v-col>
          <v-col>
            <v-btn icon @click="showInfo(idx)">
              <v-icon small color="grey lighten-1">mdi-information</v-icon>
            </v-btn>
          </v-col>
        </v-row>
      </v-list-item-action>
    </v-list-item>
    <v-dialog
        v-model="dialog"
    >
      <v-card
          color="primary darken-1"
      >
        <v-card-title>
          {{ info.name }}
        </v-card-title>

        <v-card-text>
          {{ info.isp }}
          <br/>
          {{ info.region }}
          <br/>
          {{ info.ip }}
        </v-card-text>
      </v-card>
    </v-dialog>
    <v-dialog
        v-model="showQR"
    >
      <v-card
          color="primary darken-1"
      >
        <v-card-title>
          {{ info.name }}
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
  props: ['url', 'sub'],
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
      qr: ""
    }
  },
  methods: {
    refresh() {
      axios.post(`/refresh`, {url: this.sub}).then(() => {
        this.fetch();
      })
    },

    async fetch() {
      await axios.get(this.url).then(resp => {
        const {data} = resp;
        if (data.indexOf("\n") !== -1)
          this.proxies = data.split("\n").map(p => JSON.parse(p));
        else
          this.proxies = [data];
      }).catch(err => {
        this.$store.commit("SET_ERROR_MESSAGE", err);
      });

      await axios.get(`${this.url}?target=URI`).then(resp => {
        const {data} = resp;
        if (data.indexOf("\n") !== -1)
          this.uris = data.split("\n");
        else
          this.uris = [data];
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
      const res = await axios.get(`/IP_API/${encodeURIComponent(server)}`).then(resp => resp.data);
      this.info.name = name;
      this.info.isp = `ISP：${res.isp}`;
      this.info.region = `地区：${flags.get(res.countryCode)} ${res.regionName} ${res.city}`;
      this.info.ip = `IP：${res.query}`
      this.dialog = true
    },

    async showQRCode(idx) {
      this.qr = this.uris[idx];
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