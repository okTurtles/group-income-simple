<template lang='pug'>
button.c-toggle.is-unstyled(
  :class='element'
  @click='$emit("toggle")'
  :aria-label='L("Toggle navigation")'
)
  i.icon-bars(v-if='element === "navigation"')
    slot
  i.icon-info(v-else-if='element === "sidebar"')
    slot
</template>

<script>
export default {
  name: 'Toggle',
  props: {
    element: {
      type: String,
      validator: (value) => ['navigation', 'sidebar'].includes(value),
      required: true
    }
  }
}
</script>
<style lang="scss" scoped>
@import "@assets/style/_variables.scss";
@import "@assets/style/_mixins.scss";

$speed: 300ms;
$iconSize: 2.75rem;

.c-toggle {
  @extend %reset-button;
  height: 4rem;
  position: absolute;
  top: 0;
  padding: 0.5rem 0;
  width: 2rem + $iconSize; // gap on the edge
  background-color: transparent;
  transition: height 1ms $speed, width 1ms $speed, background $speed/2;
  overflow: hidden;
  color: $text_0;

  // Similar to .button.is-icon but adapted to a "corner" button
  &:hover,
  &:focus {
    .icon-bars,
    .icon-info {
      background-color: $general_1;
    }
  }

  &:focus {
    .icon-bars,
    .icon-info {
      box-shadow: 0 0 0 2px #{$primary_1};
    }
  }

  &.navigation {
    text-align: right;
  }

  &.sidebar {
    text-align: left;
  }

  .icon-bars,
  .icon-info {
    border-radius: 50%;
    width: $iconSize;
    height: $iconSize;
    text-align: center;
    line-height: $iconSize;
    transition: opacity $speed/5 $speed;
  }

  .is-active & {
    background-color: rgba(0, 0, 0, 0.7);
    height: 100vh;
    width: 200vw;
    top: 0;
    transition: height 1ms 1ms, width 1ms 1ms, background $speed/2;

    .icon-info,
    .icon-bars {
      transition: opacity 1ms 1ms;
      opacity: 0;
    }
  }

  @include tablet {
    width: 3rem + $iconSize;
  }

  @include desktop {
    display: none;
  }
}
</style>
