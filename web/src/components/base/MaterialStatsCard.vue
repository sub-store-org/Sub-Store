<template>
  <base-material-card
      v-bind="$attrs"
      v-on="$listeners"
      :icon="icon"
      class="v-card--material-stats"
  >
    <template v-slot:after-heading>
      <div class="ml-auto text-right">
        <div
            class="body-3 grey--text font-weight-light"
            v-text="title"
        />

        <h3 class="display-2 font-weight-light text--primary">
          {{ value }} <small>{{ smallValue }}</small>
        </h3>
      </div>
    </template>

    <v-col
        class="px-0"
        cols="12"
    >
      <v-divider/>
    </v-col>

    <v-icon
        :color="subIconColor"
        class="ml-2 mr-1"
        size="16"
    >
      {{ subIcon }}
    </v-icon>

    <span
        :class="subTextColor"
        class="caption grey--text font-weight-light"
        v-text="subText"
    />
  </base-material-card>
</template>

<script>
import Card from './Card'

export default {
  name: 'MaterialStatsCard',

  inheritAttrs: false,

  props: {
    ...Card.props,
    icon: {
      type: String,
      required: true
    },
    subIcon: {
      type: String,
      default: undefined
    },
    subIconColor: {
      type: String,
      default: undefined
    },
    subTextColor: {
      type: String,
      default: undefined
    },
    subText: {
      type: String,
      default: undefined
    },
    title: {
      type: String,
      default: undefined
    },
    value: {
      type: String,
      default: undefined
    },
    smallValue: {
      type: String,
      default: undefined
    }
  }
}
</script>

<style lang="sass">
.v-card--material-stats
  display: flex
  flex-wrap: wrap
  position: relative

  > div:first-child
    justify-content: space-between

  .v-card
    border-radius: 4px
    flex: 0 1 auto

  .v-card__text
    display: inline-block
    flex: 1 0 calc(100% - 120px)
    position: absolute
    top: 0
    right: 0
    width: 100%

  .v-card__actions
    flex: 1 0 100%
</style>
