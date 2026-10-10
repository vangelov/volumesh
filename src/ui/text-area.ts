import type { FolderApi } from "tweakpane";

export function addTextarea(parent: FolderApi, text: string) {
  text = text.trim();
  const rows = text.split("\n").length;

  parent.addBinding(
    {
      text,
    },
    "text",
    {
      readonly: true,
      multiline: true,
      rows,
      label: undefined,
      interval: 0,
    },
  );
}
