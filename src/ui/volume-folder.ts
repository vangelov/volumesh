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

  const volume = anatomy.volumes[volumeState.index];
  const directionLabels = getDirectionLabels(volume.dirs);
  const callbacksMap = new Map<string, () => void>();

  callbacksMap.set(directionLabels[0].minLabel, () =>
    folder.addBinding(volumeState, "xMin", {
      min: 0,
      max: 1,
      step: 0.001,
      label: directionLabels[0].minLabel,
    }),
  );
  callbacksMap.set(directionLabels[0].maxLabel, () =>
    folder.addBinding(volumeState, "xMax", {
      min: 0,
      max: 1,
      step: 0.001,
      label: directionLabels[0].maxLabel,
    }),
  );

  callbacksMap.set(directionLabels[1].minLabel, () =>
    folder.addBinding(volumeState, "yMin", {
      min: 0,
      max: 1,
      step: 0.001,
      label: directionLabels[1].minLabel,
    }),
  );
  callbacksMap.set(directionLabels[1].maxLabel, () =>
    folder.addBinding(volumeState, "yMax", {
      min: 0,
      max: 1,
      step: 0.001,
      label: directionLabels[1].maxLabel,
    }),
  );

  callbacksMap.set(directionLabels[2].minLabel, () =>
    folder.addBinding(volumeState, "zMin", {
      min: 0,
      max: 1,
      step: 0.001,
      label: directionLabels[2].minLabel,
    }),
  );
  callbacksMap.set(directionLabels[2].maxLabel, () =>
    folder.addBinding(volumeState, "zMax", {
      min: 0,
      max: 1,
      step: 0.001,
      label: directionLabels[2].maxLabel,
    }),
  );

  for (const [minLabel, maxLabel] of DIRECTION_LABELS_MIN_MAX_PAIRS) {
    folder.addBlade({ view: "separator" });

    const minCallback = callbacksMap.get(minLabel);
    if (minCallback) minCallback();

    const maxCallback = callbacksMap.get(maxLabel);
    if (maxCallback) maxCallback();
  }

  return folder;
}
