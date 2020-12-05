<template>
  <v-card
    v-bind="$attrs"
    :class="classes"
    class="v-card--material pa-3"
  >
    <div class="d-flex grow flex-wrap">
      <v-avatar
        v-if="avatar"
        size="128"
        class="mx-auto v-card--material__avatar elevation-12"
        color="grey"
      >
        <v-img :src="avatar" />
      </v-avatar>

      <v-sheet
        v-else
        :class="{
          'pa-7': !$slots.image
        }"
        :color="color"
        :max-height="icon ? 90 : undefined"
        :width="inline || icon ? 'auto' : '100%'"
        class="text-start v-card--material__heading mb-n6"
        dark
      >
        <slot
          v-if="$slots.heading"
          name="heading"
        />

        <slot
          v-else-if="$slots.image"
          name="image"
        />

        <div
          v-else-if="title && !icon"
          class="display-1 font-weight-light"
          v-text="title"
        />

        <v-icon
          v-else-if="icon"
          size="32"
          v-text="icon"
        />

        <div
          v-if="text"
          class="headline font-weight-thin"
          v-text="text"
        />
      </v-sheet>

      <div
        v-if="$slots['after-heading']"
        class="ml-6"
      >
        <slot name="after-heading" />
      </div>

      <v-col
        v-if="hoverReveal"
        cols="12"
        class="text-center py-0 mt-n12"
      >
        <slot name="reveal-actions" />
      </v-col>

      <div
        v-else-if="icon && title"
        class="ml-4"
      >
        <div

          class="card-title font-weight-light"
          v-text="title"
        />
      </div>
    </div>

    <slot />

    <template v-if="$slots.actions">
      <v-divider class="mt-2" />

      <v-card-actions class="pb-0">
        <slot name="actions" />
      </v-card-actions>
    </template>
  </v-card>
</template>

<script>
  export default {
    name: 'MaterialCard',

    props: {
      avatar: {
        type: String,
        default: ''
      },
      color: {
        type: String,
        default: 'success'
      },
      hoverReveal: {
        type: Boolean,
        default: false
      },
      icon: {
        type: String,
        default: undefined
      },
      image: {
        type: Boolean,
        default: false
      },
      inline: {
        type: Boolean,
        default: false
      },
      text: {
        type: String,
        default: ''
      },
      title: {
        type: String,
        default: ''
      }
    },

    computed: {
      classes() {
        return {
          'v-card--material--has-heading': this.hasHeading,
          'v-card--material--hover-reveal': this.hoverReveal
        }
      },
      hasHeading() {
        return Boolean(this.$slots.heading || this.title || this.icon)
      },
      hasAltHeading() {
        return Boolean(this.$slots.heading || (this.title && this.icon))
      }
    }
  }
</script>

<style lang="sass">
  .v-card--material
    &__avatar
      position: relative
      top: -64px
      margin-bottom: -32px

    &__heading
      position: relative
      top: -40px
      transition: .3s ease
      z-index: 1

    &.v-card--material--hover-reveal:hover
      .v-card--material__heading
        transform: translateY(-40px)
</style>
