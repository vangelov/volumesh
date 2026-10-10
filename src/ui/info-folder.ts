import type { FolderApi } from "tweakpane";
import { addTextarea } from "./text-area";
import * as Data from "../data";

export function addInfoFolder(parent: FolderApi, anatomy: Data.Anatomy) {
  const folder = parent.addFolder({
    title: "Info",
    expanded: false,
  });

  addTextarea(folder, anatomy.info.description);

  folder
    .addButton({
      title: "View Full Info",
    })
    .on("click", () => {
      window.open(anatomy.info.url, "_blank");
    });

  return folder;
}
