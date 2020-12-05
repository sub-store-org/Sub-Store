import Vue from 'vue'
import Vuetify from 'vuetify/lib'
import i18n from '@/i18n'

Vue.use(Vuetify)

const theme = {
  primary: '#E91E63',
  secondary: '#9C27b0',
  accent: '#9C27b0',
  info: '#00CAE3'
}

export default new Vuetify({
  lang: {
    t: (key, ...params) => i18n.t(key, params)
  },
  theme: {
    themes: {
      dark: theme,
      light: theme
    }
  }
})
