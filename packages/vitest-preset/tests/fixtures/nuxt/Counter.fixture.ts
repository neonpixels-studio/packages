import { createApp, nextTick } from "vue";
import { expect, it } from "vitest";
import Counter from "@components/Counter.vue";

it("renders a component that uses auto-imported ref and computed", async () => {
  const element = document.createElement("div");
  const app = createApp(Counter);
  const instance = app.mount(element) as unknown as { count: number };
  expect(element.innerHTML).toBe("<p>2</p>");
  instance.count = 4;
  await nextTick();
  expect(element.innerHTML).toBe("<p>8</p>");
});
