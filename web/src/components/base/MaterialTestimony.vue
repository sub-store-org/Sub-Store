<template>
  <v-card class="text-center v-card--testimony">
    <div class="pt-6">
      <v-icon
        color="black"
        x-large
      >
        mdi-format-quote-close
      </v-icon>
    </div>

    <v-card-text
      class="display-1 font-weight-light font-italic mb-3"
      v-text="blurb"
    />

    <div
      class="display-2 font-weight-light mb-2"
      v-text="author"
    />

    <div
      class="body-2 text-uppercase grey--text"
      v-text="handle"
    />

    <v-avatar
      color="grey"
      size="100"
    >
      <v-img
        :alt="`${author} Testimonial`"
        :src="avatar"
      />
    </v-avatar>

    <div />
  </v-card>
</template>

<script>
  export default {
    name: 'BaseMaterialTestimony',

    props: {
      author: {
        type: String,
        default: ''
      },
      avatar: {
        type: String,
        default: 'https://demos.creative-tim.com/material-dashboard-pro/assets/img/faces/card-profile1-square.jpg'
      },
      blurb: {
        type: String,
        default: ''
      },
      handle: {
        type: String,
        default: ''
      }
    }
  }
</script>

<style lang="sass">
  .v-card--testimony
    padding-bottom: 72px
    margin-bottom: 64px

    .v-avatar
      position: absolute
      left: calc(50% - 64px)
      top: calc(100% - 64px)
</style>
