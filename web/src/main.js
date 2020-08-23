import Vue from 'vue'
import App from './App.vue'
import Clipboard from 'v-clipboard';
import vuetify from './plugins/vuetify';
import router from './router';
import store from './store';

Vue.config.productionTip = false
Vue.use(Clipboard);
new Vue({
    vuetify,
    router,
    store,
    render: h => h(App)
}).$mount('#app')
