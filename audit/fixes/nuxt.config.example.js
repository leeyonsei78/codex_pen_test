// Reference only; merge into the REAL config after confirming the Nuxt version.
// Do not put private values in env, publicRuntimeConfig, Vuex state or HTML.
const internalCommonApi = process.env.INTERNAL_COMMON_API_DOMAIN;

export default {
  publicRuntimeConfig: {
    VUE_APP_API_DOMAIN: process.env.PUBLIC_API_DOMAIN,
  },
  privateRuntimeConfig: {
    VUE_APP_PRIVATE_COMMON_API_DOMAIN: internalCommonApi,
    PRIVATE_DOMAINS: { common: internalCommonApi },
  },
  serverMiddleware: ['~/server-middleware/security-headers.cjs'],
};

// Also remove /lib/jquery/1.12.4/jquery.min.js from every template / head config
// and retain a single compatible, security-patched jQuery version.
// This example is not a drop-in replacement for the absent application config.
