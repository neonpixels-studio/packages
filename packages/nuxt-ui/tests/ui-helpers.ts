import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  type Component,
  type VNodeChild,
} from "vue";
import { vi } from "vitest";
import type { ConsentState } from "../shared/lib/index.ts";
import {
  ANALYTICS_AND_REPLAY,
  createHarness,
  type HarnessOptions,
} from "./consent-helpers.ts";

type Slots = Record<string, (props: Record<string, unknown>) => VNodeChild>;

export const NuxtLinkStub = defineComponent({
  name: "NuxtLink",
  props: { to: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h("a", { href: props.to }, slots.default?.());
  },
});

export interface Mounted {
  container: HTMLElement;
  unmount: () => void;
  // Changes some of the props the component is rendered with.
  rerender: (props: Record<string, unknown>) => void;
}

export function mountComponent(
  component: Component,
  props: Record<string, unknown> = {},
  slots: Slots = {},
): Mounted {
  const container = document.createElement("div");
  document.body.append(container);
  const currentProps = ref(props);
  const app = createApp({
    render: () => h(component, currentProps.value, slots),
  });
  app.component("NuxtLink", NuxtLinkStub);
  app.mount(container);
  return {
    container,
    unmount: () => {
      app.unmount();
      container.remove();
    },
    rerender: (nextProps) => {
      currentProps.value = { ...currentProps.value, ...nextProps };
    },
  };
}

export function createReactiveConsentState(): ConsentState {
  return {
    status: ref("unset"),
    isHydrated: ref(false),
    isReopened: ref(false),
  };
}

// Stands in for the Nuxt app that `useConsent()` reads its controller from.
export function installConsent(options: HarnessOptions = {}) {
  const state = options.state ?? createReactiveConsentState();
  const harness = createHarness({ ...options, state });
  vi.stubGlobal("useNuxtApp", () => ({
    $consentController: harness.controller,
    $consentSettings: options.settings ?? ANALYTICS_AND_REPLAY,
    $consentState: state,
  }));
  return harness;
}

export async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}
