// Reference fix only. Prefer Vue {{ value }} / v-text or DOM textContent.
// This encodes plain text for HTML text and quoted, ordinary text attributes.
// It is NOT an HTML sanitizer or a validator for URLs, JS, CSS or event handlers.
const entities = Object.freeze({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
});

export function encodeHtmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}
