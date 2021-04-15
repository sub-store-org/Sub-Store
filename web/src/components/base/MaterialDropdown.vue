<template>
  <v-menu
      v-model="value"
      v-bind="$attrs"
      :transition="transition"
      offset-y
  >
    <template v-slot:activator="{ attrs, on }">
      <v-btn
          v-bind="attrs"
          v-on="on"
          :color="color"
          default
          min-width="200"
          rounded
      >
        <slot/>

        <v-icon>
          mdi-{{ value ? 'menu-up' : 'menu-down' }}
        </v-icon>
      </v-btn>
    </template>

    <v-sheet>
      <v-list dense>
        <v-list-item
            v-for="(item, i) in items"
            :key="i"
            @click="$(`click:action-${item.id}`)"
        >
          <v-list-item-content>
            <v-list-item-title v-text="item.text"/>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-sheet>
  </v-menu>
</template>

<script>
// Mixins
import Proxyable from 'vuetify/lib/mixins/proxyable'

export default {
  name: 'MaterialDropdown',

  mixins: [Proxyable],

  props: {
    color: {
      type: String,
      default: 'primary'
    },
    items: {
      type: Array,
      default: () => ([
        {
          id: undefined,
          text: undefined
        }
      ])
    },
    transition: {
      type: String,
      default: 'scale-transition'
    }
  }
}
</script>
