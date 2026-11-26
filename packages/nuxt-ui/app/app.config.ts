// Empty on purpose: an app must set its own storagePrefix, and the layer
// fails with a clear message on first use when it is missing.
export default defineAppConfig({
  appearance: {
    storagePrefix: "",
    accents: [],
    defaultAccent: "",
    legacyKeys: {},
  },
});
