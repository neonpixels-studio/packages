import * as vue from "vue";

// The clobbering pattern the preset guards against: copying every Vue export
// onto globalThis, which includes Vue's own `Comment` and `Text` symbols.
Object.assign(globalThis, vue);
