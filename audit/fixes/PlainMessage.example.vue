<!-- Reference replacement for the global message span. Merge into the actual
     component; this standalone example was not compiled against the absent app. -->
<template>
  <span class="plain-message" v-text="message" />
</template>

<script>
export default {
  props: {
    message: { type: String, default: '' },
  },
}
</script>

<style scoped>
.plain-message { white-space: pre-line; }
</style>
