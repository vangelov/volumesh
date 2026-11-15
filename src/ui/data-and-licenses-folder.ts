import type { FolderApi } from "tweakpane";
import { addTextarea } from "./text-area";

export function addDataAndLicensesFolder(parent: FolderApi) {
  const dataAndLicensesFolder = parent.addFolder({
    title: "Data Sources & Licenses",
    expanded: false,
  });

  addTextarea(
    dataAndLicensesFolder,
    `
Medical imaging and anatomical mesh data are sourced
from the Open Anatomy Project.

See the links below for the original data sources and
licensing information.
    `,
  );

  dataAndLicensesFolder
    .addButton({
      title: "View Open Anatomy Porject",
    })
    .on("click", () => {
      window.open("https://www.openanatomy.org/", "_blank");
    });

  dataAndLicensesFolder
    .addButton({
      title: "View 3D Slicer License",
    })
    .on("click", () => {
      window.open(`${import.meta.env.BASE_URL}3D_SLICER_LICENSE.txt`, "_blank");
    });
}
