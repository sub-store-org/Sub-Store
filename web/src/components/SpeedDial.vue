<template>
  <v-fab-transition>
    <v-speed-dial
        v-model="opened"
        absolute
        bottom
        direction="top"
        fab
        left
        small
        transition="slide-y-reverse-transition"
    >
      <template #activator>
        <v-btn
            fab
        >
          <v-icon v-if="opened">mdi-close</v-icon>
          <v-icon v-else>mdi-plus</v-icon>
        </v-btn>
      </template>
      <v-btn
          color="primary"
          fab
      >
        <v-icon>mdi-plus</v-icon>
      </v-btn>
      <v-btn
          color="primary"
          fab
      >
        <v-icon>create_new_folder</v-icon>
      </v-btn>
    </v-speed-dial>
  </v-fab-transition>
</template>

<script>
export default {
  data() {
    return {
      opened: false,
    }
  },
  computed: {}
}
</script>
