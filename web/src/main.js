import Vue from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify';
import 'material-design-icons-iconfont/dist/material-design-icons.css'
import './plugins/base';
import './plugins/chartist';
// import './plugins/vee-validate';
import './plugins/vue-world-map';
import i18n from './i18n';
import router from './router';
import store from './store';
import Clipboard from 'v-clipboard';

Vue.config.productionTip = false
Vue.use(Clipboard);
new Vue({
    vuetify,
    router,
    store,
    Clipboard,
    i18n,
    render: h => h(App)
}).$mount('#app')
