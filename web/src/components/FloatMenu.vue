<template>
  <div class="float-menu-switch-wrapper" ref = "floatMenuSwitch">
  <v-speed-dial
                class="float-menu-switch"
                v-model="fab"
                :direction="direction"
                :transition="transition"
  >
    <template v-slot:activator>
      <v-btn v-model="fab" color="primary" dark fab>
        <v-icon v-if="fab"> mdi-close</v-icon>
        <v-icon v-else> mdi-gesture-double-tap</v-icon>
      </v-btn>
    </template>
    <slot></slot>
  </v-speed-dial>
  </div>
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
      transition: "scale-transition",
    };
  },

  updated (){
    const floatMenuSwitch = this.$refs.floatMenuSwitch;
    console.log(floatMenuSwitch);
    floatMenuSwitch.style.bottom = 2*this.bottomNavBarHeight + "px";
  },

  computed : {
    bottomNavBarHeight (){
      return this.$store.state.bottomNavBarHeight;
    },
  },
};
</script>
<style lang="scss" scoped>
  .float-menu-switch-wrapper {
    position : fixed;
    right: 16px;;
    z-index  : 99;

    > .float-menu-switch{

      .v-btn {
        width  : 40px;
        height : 40px;
      }
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
