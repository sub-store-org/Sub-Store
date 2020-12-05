<template>
  <v-fab-transition>
    <v-speed-dial
        v-model="opened"
        direction="top"
        left
        fab
        absolute
        bottom
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
          fab
          color="primary"
      >
        <v-icon>mdi-plus</v-icon>
      </v-btn>
      <v-btn
          fab
          color="primary"
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
  computed: {

  }
}
</script>
