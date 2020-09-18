import Vue from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify';
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
    render: h => h(App)
}).$mount('#app')
