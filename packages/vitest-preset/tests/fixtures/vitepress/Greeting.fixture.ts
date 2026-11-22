import { createApp } from "vue";
import { expect, it } from "vitest";
import Greeting from "@components/Greeting.vue";

function render(props: { name: string; visible: boolean }): HTMLElement {
  const element = document.createElement("div");
  createApp(Greeting, props).mount(element);
  return element;
}

it("compiles single-file components and honors the consumer's alias", () => {
  expect(render({ name: "Vue", visible: true }).innerHTML).toBe(
    "<p>Hello Vue</p>",
  );
});

it("renders the v-if placeholder comment node", () => {
  expect(render({ name: "Vue", visible: false }).innerHTML).toBe("<!--v-if-->");
});
