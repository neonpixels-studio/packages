// Empty on purpose: an app must set its own storagePrefix, and the layer
// fails with a clear message on first use when it is missing. The same goes
// for `consent.app` once Google Analytics or Sentry is configured.
export default defineAppConfig({
  appearance: {
    storagePrefix: "",
    accents: [],
    defaultAccent: "",
    legacyKeys: {},
  },
  consent: {
    app: "",
    legacyKey: "",
  },
});
