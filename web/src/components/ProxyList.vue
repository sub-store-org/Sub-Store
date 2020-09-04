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
        <v-btn icon @click="showInfo(idx)">
          <v-icon color="grey lighten-1">mdi-information</v-icon>
        </v-btn>
      </v-list-item-action>
    </v-list-item>
    <v-dialog
        v-model="dialog"
    >
      <v-card>
        <v-card-title>
          {{info.name}}
        </v-card-title>

        <v-card-text>
          {{info.isp}}
          <br/>
          {{info.region}}
          <br/>
          {{info.ip}}
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-list>
</template>

<script>
import {axios} from "@/utils";

const flags = new Map([[ "AC" , "🇦🇨" ] , [ "AF" , "🇦🇫" ] , [ "AI" , "🇦🇮" ] , [ "AL" , "🇦🇱" ] , [ "AM" , "🇦🇲" ] , [ "AQ" , "🇦🇶" ] , [ "AR" , "🇦🇷" ] , [ "AS" , "🇦🇸" ] , [ "AT" , "🇦🇹" ] , [ "AU" , "🇦🇺" ] , [ "AW" , "🇦🇼" ] , [ "AX" , "🇦🇽" ] , [ "AZ" , "🇦🇿" ] , [ "BB" , "🇧🇧" ] , [ "BD" , "🇧🇩" ] , [ "BE" , "🇧🇪" ] , [ "BF" , "🇧🇫" ] , [ "BG" , "🇧🇬" ] , [ "BH" , "🇧🇭" ] , [ "BI" , "🇧🇮" ] , [ "BJ" , "🇧🇯" ] , [ "BM" , "🇧🇲" ] , [ "BN" , "🇧🇳" ] , [ "BO" , "🇧🇴" ] , [ "BR" , "🇧🇷" ] , [ "BS" , "🇧🇸" ] , [ "BT" , "🇧🇹" ] , [ "BV" , "🇧🇻" ] , [ "BW" , "🇧🇼" ] , [ "BY" , "🇧🇾" ] , [ "BZ" , "🇧🇿" ] , [ "CA" , "🇨🇦" ] , [ "CF" , "🇨🇫" ] , [ "CH" , "🇨🇭" ] , [ "CK" , "🇨🇰" ] , [ "CL" , "🇨🇱" ] , [ "CM" , "🇨🇲" ] , [ "CN" , "🇨🇳" ] , [ "CO" , "🇨🇴" ] , [ "CP" , "🇨🇵" ] , [ "CR" , "🇨🇷" ] , [ "CU" , "🇨🇺" ] , [ "CV" , "🇨🇻" ] , [ "CW" , "🇨🇼" ] , [ "CX" , "🇨🇽" ] , [ "CY" , "🇨🇾" ] , [ "CZ" , "🇨🇿" ] , [ "DE" , "🇩🇪" ] , [ "DG" , "🇩🇬" ] , [ "DJ" , "🇩🇯" ] , [ "DK" , "🇩🇰" ] , [ "DM" , "🇩🇲" ] , [ "DO" , "🇩🇴" ] , [ "DZ" , "🇩🇿" ] , [ "EA" , "🇪🇦" ] , [ "EC" , "🇪🇨" ] , [ "EE" , "🇪🇪" ] , [ "EG" , "🇪🇬" ] , [ "EH" , "🇪🇭" ] , [ "ER" , "🇪🇷" ] , [ "ES" , "🇪🇸" ] , [ "ET" , "🇪🇹" ] , [ "EU" , "🇪🇺" ] , [ "FI" , "🇫🇮" ] , [ "FJ" , "🇫🇯" ] , [ "FK" , "🇫🇰" ] , [ "FM" , "🇫🇲" ] , [ "FO" , "🇫🇴" ] , [ "FR" , "🇫🇷" ] , [ "GA" , "🇬🇦" ] , [ "GB" , "🇬🇧" ] , [ "HK" , "🇭🇰" ] ,["HU","🇭🇺"], [ "ID" , "🇮🇩" ] , [ "IE" , "🇮🇪" ] , [ "IL" , "🇮🇱" ] , [ "IM" , "🇮🇲" ] , [ "IN" , "🇮🇳" ] , [ "IS" , "🇮🇸" ] , [ "IT" , "🇮🇹" ] , [ "JP" , "🇯🇵" ] , [ "KR" , "🇰🇷" ] , [ "LU" , "🇱🇺" ] , [ "MO" , "🇲🇴" ] , [ "MX" , "🇲🇽" ] , [ "MY" , "🇲🇾" ] , [ "NL" , "🇳🇱" ] , [ "PH" , "🇵🇭" ] , [ "RO" , "🇷🇴" ] , [ "RS" , "🇷🇸" ] , [ "RU" , "🇷🇺" ] , [ "RW" , "🇷🇼" ] , [ "SA" , "🇸🇦" ] , [ "SB" , "🇸🇧" ] , [ "SC" , "🇸🇨" ] , [ "SD" , "🇸🇩" ] , [ "SE" , "🇸🇪" ] , [ "SG" , "🇸🇬" ] , [ "TH" , "🇹🇭" ] , [ "TN" , "🇹🇳" ] , [ "TO" , "🇹🇴" ] , [ "TR" , "🇹🇷" ] , [ "TV" , "🇹🇻" ] , [ "TW" , "🇨🇳" ] , [ "UK" , "🇬🇧" ] , [ "UM" , "🇺🇲" ] , [ "US" , "🇺🇸" ] , [ "UY" , "🇺🇾" ] , [ "UZ" , "🇺🇿" ] , [ "VA" , "🇻🇦" ] , [ "VE" , "🇻🇪" ] , [ "VG" , "🇻🇬" ] , [ "VI" , "🇻🇮" ] , [ "VN" , "🇻🇳" ] , [ "ZA" , "🇿🇦"]])

export default {
  name: "ProxyList",
  props: ['url', 'sub'],
  data: function () {
    return {
      proxies: [],
      dialog: false,
      info: {
        name: "",
        isp: "",
        region: "",
        ip: ""
      }
    }
  },
  methods: {
    refresh() {
      axios.post(`/refresh`, {url: this.sub}).then(() => {
        this.fetch();
      })
    },

    fetch() {
      axios.get(this.url).then(resp => {
        const {data} = resp;
        this.proxies = data.split("\n").map(p => JSON.parse(p));
      }).catch(err => {
        this.$store.commit("SET_ERROR_MESSAGE", err);
      });
    },

    async showInfo(idx) {
      const {server, name} = this.proxies[idx];
      const res = await axios.get(`/IP_API/${encodeURIComponent(server)}`).then(resp => resp.data);
      this.info.name = name;
      this.info.isp = `ISP：${res.org}`;
      this.info.region = `地区：${flags.get(res.countryCode)} ${res.regionName} ${res.city}`;
      this.info.ip = `IP：${res.query}`
      this.dialog = true
    },
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