<template>
  <base-item-group
      :item="item"
      sub-group
      text
  />
</template>

<script>
export default {
  name: 'ItemSubGroup',

  props: {
    item: {
      type: Object,
      default: () => ({
        avatar: undefined,
        group: undefined,
        title: undefined,
        children: []
      })
    }
  }
}
</script>
