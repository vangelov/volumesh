import type { Pane } from "tweakpane";

import type { State } from "../state";
import * as Data from "../data";
import * as Lib from "../lib";

type Params = {
  anatomy: Data.Anatomy;
  state: State;
  onShowAllMeshes: () => void;
  onHideAllMeshes: () => void;
};

export function addMeshesFolder(
  anatomiesPane: Pane,
  { anatomy, state, onShowAllMeshes, onHideAllMeshes }: Params,
) {
  const anatomyState = state.byAnatomyId[state.anatomyId];

  const folder = anatomiesPane.addFolder({ title: "Meshes", expanded: true });

  folder.addBinding(anatomyState.meshes, "opacity", {
    min: 0,
    max: 1,
    step: 0.01,
    label: "Opacity",
  });

  const tabs = folder.addTab({
    pages: [{ title: "All Meshes" }, { title: "Selected Mesh" }],
  });

  const { meshes } = anatomy;

  const allMeshesPage = tabs.pages[0];
  const selectedMeshPage = tabs.pages[1];

  allMeshesPage
    .addButton({
      title: "Show All",
    })
    .on("click", onShowAllMeshes);

  allMeshesPage
    .addButton({
      title: "Hide All",
    })
    .on("click", onHideAllMeshes);

  for (const [index, mesh] of meshes.entries()) {
    allMeshesPage.addBlade({ view: "separator" });

    const proxy = {
      get color() {
        return Lib.hexFromRgb(anatomyState.meshes.byIndex[index].color);
      },
      set color(hex) {
        anatomyState.meshes.byIndex[index].color = Lib.hexToRgb(hex);
      },
    };

    allMeshesPage
      .addBinding(proxy, "color", {
        label: mesh.label,
      })
      .on("change", () => anatomiesPane.refresh());

    allMeshesPage
      .addBinding(anatomyState.meshes.byIndex[index], "visible", {
        label: "",
      })
      .on("change", () => anatomiesPane.refresh());
  }

  selectedMeshPage.addBlade({
    view: "text",
    parse: (v: string) => String(v),
    value: "[Shift] + [Click] on a mesh to select it",
  });

  selectedMeshPage.addBlade({ view: "separator" });

  selectedMeshPage
    .addBinding(anatomyState.meshes, "meshIndex", {
      label: "Name",
      options: anatomy.meshes.map(({ label }, index) => ({
        value: index,
        text: label,
      })),
    })
    .on("change", () => anatomiesPane.refresh());

  selectedMeshPage.addBinding(
    {
      get color() {
        return Lib.hexFromRgb(
          anatomyState.meshes.byIndex[anatomyState.meshes.meshIndex].color,
        );
      },
      set color(hex) {
        anatomyState.meshes.byIndex[anatomyState.meshes.meshIndex].color =
          Lib.hexToRgb(hex);
        anatomiesPane.refresh();
      },
    },
    "color",
    {
      label: "Color",
    },
  );

  selectedMeshPage.addBinding(
    {
      get visible() {
        return anatomyState.meshes.byIndex[anatomyState.meshes.meshIndex]
          .visible;
      },
      set visible(v) {
        anatomyState.meshes.byIndex[anatomyState.meshes.meshIndex].visible = v;
        anatomiesPane.refresh();
      },
    },
    "visible",
    {
      label: "Visible",
    },
  );

  selectedMeshPage.addBlade({ view: "separator" });

  selectedMeshPage.addBinding(anatomyState.meshes, "useClipSphere", {
    label: "Clip Sphere",
  });

  selectedMeshPage.addBinding(anatomyState.meshes, "clipRadius", {
    min: 0,
    max: 1,
    step: 0.001,
    label: "Clip Radius",
  });

  return folder;
}
