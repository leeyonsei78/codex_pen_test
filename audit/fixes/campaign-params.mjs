// Reference replacement for raw query-string persistence in external/load.js.
// Do not send PII or credentials in any URL, including allowed UTM fields.
const allowedNames = Object.freeze(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']);

export function extractCampaignParams(href) {
  const url = new URL(href);
  if (!['https:', 'http:'].includes(url.protocol)) throw new TypeError('Expected HTTP(S) page URL');
  const result = new URLSearchParams();
  for (const name of allowedNames) {
    const value = url.searchParams.get(name);
    if (value && value.length <= 128 && /^[A-Za-z0-9_.~-]+$/.test(value)) result.set(name, value);
  }
  return { query: result.toString(), source: result.get('utm_source') || '' };
}

// Reference caller: campaign data is tab scoped, never a raw URL or token.
// Pass window.sessionStorage and window.localStorage after consent/policy review.
export function storeCampaignParams(href, tabStorage, persistentStorage) {
  const campaign = extractCampaignParams(href);
  persistentStorage.removeItem('X_UTM_PARAM');
  persistentStorage.removeItem('X_UTM_SOURCE');
  tabStorage.setItem('X_UTM_PARAM', campaign.query);
  tabStorage.setItem('X_UTM_SOURCE', campaign.source);
  return campaign;
}
