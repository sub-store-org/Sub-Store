<script>
  // Components
  import { VAlert, VBtn, VIcon } from 'vuetify/lib'

  export default {
    name: 'MaterialAlert',

    extends: VAlert,

    computed: {
      __cachedDismissible() {
        if (!this.dismissible) return null

        const color = 'white'

        return this.$createElement(VBtn, {
          staticClass: 'v-alert__dismissible',
          props: {
            color,
            icon: true,
            small: true
          },
          attrs: {
            'aria-label': this.$vuetify.lang.t(this.closeLabel)
          },
          on: {
            // eslint-disable-next-line
            click: () => (this.isActive = false)
          }
        }, [
          this.$createElement(VIcon, {
            props: { color }
          }, '$vuetify.icons.cancel')
        ])
      },
      classes() {
        return {
          ...VAlert.options.computed.classes.call(this),
          'v-alert--material': true
        }
      },
      hasColoredIcon() {
        return true
      }
    }
  }
</script>

<style lang="sass">

  .v-alert--material
    margin-top: 32px

    .v-alert__icon
      background-color: #FFFFFF
      height: 44px
      min-width: 44px
      top: -36px

    .v-alert__dismissible
      align-self: flex-start
      margin: 0 !important
      padding: 0 !important
</style>
