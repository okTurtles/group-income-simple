<template lang='pug'>
  button.c-modal-close(
    :class='{ backOnMobile, fullscreen }'
    @click.self='$emit("close")'
    :aria-label='L("close modal")'
    data-test='closeModal'
  )
    i.icon-chevron-left.c-iconBack(aria-hidden='true')
    i18n.c-modal-close-txt.has-text-small ESC
</template>

<script>
export default {
  name: 'ModalClose',
  props: {
    backOnMobile: Boolean,
    fullscreen: Boolean
  }
}
</script>

<style lang="scss" scoped>
@import "@assets/style/_variables.scss";

.c-modal-close {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 4;
  height: 2.75rem;
  width: 2.75rem;
  border: none;
  border-radius: 50%;
  padding: 0;
  -moz-appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  background-color: $general_1;

  @include tablet {
    top: 1.5rem;
    right: 1.5rem;
  }

  @include desktop {
    position: absolute;
    top: 1rem;
    right: 1rem;
  }

  &.fullscreen {
    @include desktop {
      top: 1.5rem;
      position: fixed;
      right: 2.5rem;
    }

    .c-modal-close-text {
      display: block;
      position: absolute;
      bottom: calc(-1em - 0.5rem);
      left: 0;
      text-align: center;
      width: 100%;
      color: $text_0;

      @include touch {
        display: none;
      }
    }
  }

  .c-iconBack {
    display: none;
  }

  &::before,
  &::after {
    background-color: $text_0;
    content: "";
    display: block;
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0.75rem;
    height: 0.125rem;
    transition: transform 0.15s ease-in;
    transform: translateX(-50%) translateY(-50%) rotate(45deg);
    transform-origin: center center;
  }

  &::after {
    transform: translateX(-50%) translateY(-50%) rotate(-45deg);
  }

  &:focus {
    outline: none;
  }

  &:hover {
    &::before {
      transform: translateX(-50%) translateY(-50%) rotate(0);
    }

    &::after {
      transform: translateX(-50%) translateY(-50%) rotate(0);
    }
  }

  &.backOnMobile {
    @include until($tablet) {
      position: relative;
      left: 0;
      top: 0;
      margin-right: 1rem;

      .c-iconBack {
        display: block;
        color: $text_0;
        margin-left: 0;
      }

      &::before,
      &::after {
        content: none;
      }
    }
  }

  &-txt {
    display: none;
  }
}
</style>
