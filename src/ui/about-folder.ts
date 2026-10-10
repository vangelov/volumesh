import type { Pane } from "tweakpane";

export function addAboutFolder(anatomiesPane: Pane) {
  const folder = anatomiesPane.addFolder({ title: "About" });
  folder.addBlade({
    view: "text",
    parse: (v: string) => String(v),
    value:
      "Medical imaging and anatomical mesh data are provided by the Open Anatomy Project.",
  });
  return folder;
}
