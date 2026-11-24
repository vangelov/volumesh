import type { Pane } from "tweakpane";

import * as Data from "../data";
import * as Lib from "../lib";
import type { State } from "../state";
import type { vec3 } from "gl-matrix";

type Params = {
  anatomy: Data.Anatomy;
  state: State;
  onVolumeChange: (index: number) => void;
};

const DIRECTION_LABELS_MIN_MAX_PAIRS = [
  ["Left", "Right"],
  ["Posterior", "Anterior"],
  ["Inferior", "Superior"],
];

function getDirectionLabels(rasDirs: Array<vec3>) {
  const result: Array<{ minLabel: string; maxLabel: string }> = [];

  rasDirs.forEach((dir, i) => {
    const axis = Lib.getDominantAxis(dir);
    const [minLabel, maxLabel] = DIRECTION_LABELS_MIN_MAX_PAIRS[axis];

    result[i] =
      dir[axis] > 0
        ? { minLabel, maxLabel }
        : { minLabel: maxLabel, maxLabel: minLabel };
  });

  return result;
}

export function addVolumeFolder(
  pane: Pane,
  { anatomy, state, onVolumeChange }: Params,
) {
  const volumeState = state.byAnatomyId[state.anatomyId].volume;

  const folder = pane.addFolder({ title: "Volume", expanded: true });

  let updateDirectionLabels = () => {};

  if (anatomy.volumes.length > 1) {
    folder
      .addBinding(volumeState, "index", {
        label: "Variant",

        options: anatomy.volumes.map(({ label }, index) => ({
          text: label,
          value: index,
        })),
      })
      .on("change", (event) => {
        updateDirectionLabels();
        onVolumeChange(event.value);
      });
  } else {
    folder.addBinding(volumeState, "index", {
      label: "Variant",
      readonly: true,
      interval: -1,

      format: () => anatomy.volumes[0].label,
    });
  }

  folder.addBinding(volumeState, "show", {
    label: "Show",
  });

  folder.addBinding(volumeState, "maskWithMeshes", {
    label: "Mask with Meshes",
  });

  folder.addBlade({ view: "separator" });

  folder.addBinding(volumeState, "windowCenter", {
    min: 0,
    max: 1,
    step: 0.001,
    label: "Window Center",
  });

  folder.addBinding(volumeState, "windowWidth", {
    min: 0,
    max: 1,
    step: 0.001,
    label: "Window Width",
  });

  folder.addBlade({ view: "separator" });

  folder.addBinding(volumeState, "opacity", {
    min: 0,
    max: 1,
    step: 0.001,
    label: "Opacity",
  });

  folder.addBinding(volumeState, "dtScale", {
    min: 1,
    max: 10,
    step: 0.1,
    label: "dt Scale",
  });

  folder.addBlade({ view: "separator" });

  const axes = [
    { min: "xMin", max: "xMax" },
    { min: "yMin", max: "yMax" },
    { min: "zMin", max: "zMax" },
  ] as const;
  const initialLabels = getDirectionLabels(anatomy.volumes[volumeState.index].dirs);
  const order = DIRECTION_LABELS_MIN_MAX_PAIRS.flat();
  const controls = axes.flatMap((keys, axis) => [
    { axis, side: "minLabel" as const, key: keys.min },
    { axis, side: "maxLabel" as const, key: keys.max },
  ]).sort((a, b) => order.indexOf(initialLabels[a.axis][a.side]) - order.indexOf(initialLabels[b.axis][b.side]));
  const bindings = controls.map((control, index) => {
    if (index % 2 === 0) folder.addBlade({ view: "separator" });
    const binding = folder.addBinding(volumeState, control.key, {
      min: 0,
      max: 1,
      step: 0.001,
      label: initialLabels[control.axis][control.side],
    });
    return { ...control, binding };
  });
  updateDirectionLabels = () => {
    const labels = getDirectionLabels(anatomy.volumes[volumeState.index].dirs);
    for (const { axis, side, binding } of bindings) binding.label = labels[axis][side];
  };

  return folder;
}
