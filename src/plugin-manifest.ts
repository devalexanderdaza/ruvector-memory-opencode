import { activatePlugin, deactivatePlugin } from "./index.js";

export const plugin = {
  name: "ruvector-memory",
  activate: activatePlugin,
  deactivate: deactivatePlugin,
};
