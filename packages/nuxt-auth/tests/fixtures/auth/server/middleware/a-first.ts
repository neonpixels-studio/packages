// Sorts before the layer's middleware by name, so it only sees an
// authenticated request if the layer's middleware really runs first.
export default defineEventHandler((event) => {
  event.context.sawAuthFirst = typeof event.context.auth === "object";
});
