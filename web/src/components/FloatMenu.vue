<template>
  <v-speed-dial
    class="float-menu-switch"
    v-model="fab"
    :top="top"
    :bottom="bottom"
    :right="right"
    :left="left"
    :direction="direction"
    :open-on-hover="hover"
    :transition="transition"
  >
    <template v-slot:activator>
      <v-btn v-model="fab" color="blue darken-2" dark fab>
        <v-icon v-if="fab"> mdi-close</v-icon>
        <v-icon v-else> mdi-gesture-double-tap</v-icon>
      </v-btn>
    </template>
    <slot></slot>
  </v-speed-dial>
</template>
<script>
export default {
  name: "FloatMenu",
  data() {
    return {
      direction: "top",
      fab: false,
      fling: false,
      hover: false,
      tabs: null,
      top: false,
      right: true,
      bottom: true,
      left: false,
      transition: "scale-transition",
    };
  },
  watch: {
    top(val) {
      this.bottom = !val;
    },
    right(val) {
      this.left = !val;
    },
    bottom(val) {
      this.top = !val;
    },
    left(val) {
      this.right = !val;
    },
  },
};
</script>
<style lang="scss" scoped>
.float-menu-switch {
  position: fixed;
  bottom: 80px;
  right: 20px;
  > .v-btn {
    width: 40px;
    height: 40px;
  }
}

/* This is for documentation purposes and will not be needed in your application */
#create .v-speed-dial {
  position: absolute;
}

#create .v-btn--floating {
  position: relative;
}
</style>
