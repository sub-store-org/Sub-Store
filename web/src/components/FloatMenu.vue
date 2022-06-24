<template>
  <div class = "float-menu-switch-wrapper" ref = "floatMenuSwitch">
    <v-speed-dial v-model = "fab" :direction = "direction" :transition = "transition"
    >
      <template v-slot:activator>
        <v-btn v-model = "fab" color = "primary" fab>
          <v-icon v-if = "fab"> mdi-close</v-icon>
          <v-icon v-else> mdi-gesture-double-tap</v-icon>
        </v-btn>
      </template>
      <slot></slot>
    </v-speed-dial>
  </div>
</template>
<script>
  export default {
    name : "FloatMenu",
    data (){
      return {
        direction : "top",
        fab : false,
        fling : false,
        hover : false,
        tabs : null,
        transition : "scale-transition",
      };
    },
    updated (){
      const floatMenuSwitch = this.$refs.floatMenuSwitch;
      floatMenuSwitch.style.bottom = 2 * this.bottomNavBarHeight + "px";
    },
    computed : {
      bottomNavBarHeight (){
        return this.$store.state.bottomNavBarHeight;
      },
    },
  };
</script>
<style lang = "scss" scoped>
  .float-menu-switch-wrapper {
    position : fixed;
    right    : 16px;;
    z-index  : 99;

    .v-speed-dial > button.v-btn.v-btn--round {
      margin-right : 0;
      width        : 40px;
      height       : 40px;
    }

    ::v-deep .v-speed-dial__list button.theme--light.v-btn {
      margin-right : 0;
    }
  }

  /* This is for documentation purposes and will not be needed in your application */
  #create .v-speed-dial {
    position : absolute;
  }

  #create .v-btn--floating {
    position : relative;
  }
</style>
