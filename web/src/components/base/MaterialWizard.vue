<template>
  <v-card
    class="v-card--wizard"
    elevation="12"
    max-width="700"
  >
    <v-card-title class="justify-center display-2 font-weight-light pt-5">
      Build your profile
    </v-card-title>

    <div class="text-center display-1 grey--text font-weight-light mb-6">
      This information will let us know more about you.
    </div>

    <v-tabs
      ref="tabs"
      v-model="internalValue"
      background-color="green lighten-5"
      color="white"
      grow
      slider-size="50"
    >
      <v-tabs-slider
        class="mt-1"
        color="success"
      />

      <v-tab
        v-for="(item, i) in items"
        :key="i"
        :ripple="false"
        :disabled="!availableSteps.includes(i)"
      >
        {{ item }}
      </v-tab>
    </v-tabs>

    <div class="my-6" />

    <v-card-text>
      <v-tabs-items v-model="internalValue">
        <slot />
      </v-tabs-items>
    </v-card-text>

    <v-card-actions class="pb-4 pa-4">
      <v-btn
        :disabled="internalValue === 0"
        class="white--text"
        color="grey darken-2"
        min-width="125"
        @click="$emit('click:prev')"
      >
        Previous
      </v-btn>

      <v-spacer />

      <v-btn
        :disabled="!availableSteps.includes(internalValue + 1)"
        color="success"
        min-width="100"
        @click="$emit('click:next')"
      >
        {{ internalValue === items.length - 1 ? 'Finish' : 'Next' }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script>
  // Mixins
  import Proxyable from 'vuetify/lib/mixins/proxyable'

  export default {
    name: 'BaseMaterialWizard',

    mixins: [Proxyable],

    props: {
      availableSteps: {
        type: Array,
        default: () => ([])
      },
      items: {
        type: Array,
        default: () => ([])
      }
    }
  }
</script>

<style lang="sass">
  .v-card--wizard
    overflow: visible

    .v-tabs-bar
      height: 56px
      padding: 0 8px

    .v-slide-group__wrapper
      overflow: visible

    .v-tabs-slider
      border-radius: 4px

    .v-slide-group__wrapper
      contain: initial
</style>
