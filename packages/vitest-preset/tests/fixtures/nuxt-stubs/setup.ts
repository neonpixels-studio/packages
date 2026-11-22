// Consumer setup files run after the preset's, so this replaces a preset stub.
Object.assign(globalThis, { useHead: () => "overridden" });
