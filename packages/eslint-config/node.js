import globals from "globals";
import { withBase } from "./lib/base.js";

export default withBase({
  name: "neon-pixels/node",
  languageOptions: { globals: globals.node },
});
