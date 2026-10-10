import * as Lib from "../lib";
import * as Data from "../data";

export type State = {
  anatomyId: string;
  progress: number;
  byAnatomyId: Record<string, AnatomyState>;
};

export const State = {
  create,
  onAnatomyLoaded,
  onSelectAllMeshes,
  onUnselectAllMeshes,
  onReset,
  onMeshSelect,
};

//

type VolumeState = {
  index: number;
  show: boolean;

  windowCenter: number;
  windowWidth: number;

  opacity: number;
  dtScale: number;

  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
};

type MeshesState = {
  opacity: number;
  meshIndex: number;
  useClipSphere: boolean;
  clipRadius: number;
  byIndex: Array<{
    visible: boolean;
    color: number[];
  }>;
};

type AnatomyState = {
  volume: VolumeState;
  meshes: MeshesState;
};

const anatomyStateCache = new Map<string, AnatomyState>();

function create(anatomyId: string): State {
  return {
    anatomyId,
    progress: 0,
    byAnatomyId: {},
  };
}

function onAnatomyLoaded(
  state: State,
  anatomy: Data.Anatomy,
  initialAnatomyState?: AnatomyState | null,
) {
  let anatomyState = state.byAnatomyId[anatomy.id];

  if (!anatomyState) {
    anatomyState = initialAnatomyState || {
      volume: {
        index: 0,
        show: true,

        windowCenter: 0.5,
        windowWidth: 0.5,

        opacity: 0.5,
        dtScale: 1,

        xMin: 0,
        xMax: 1,
        yMin: 0,
        yMax: 1,
        zMin: 0,
        zMax: 1,
      },

      meshes: {
        useClipSphere: true,
        clipRadius: 0,
        opacity: 0.5,
        meshIndex: 0,

        byIndex: anatomy.meshes.map(({ label }) => {
          return {
            visible: true,
            color: Lib.hexToRgb(Lib.colorFromLabel(label)),
          };
        }),
      },
    };

    anatomyStateCache.set(anatomy.id, structuredClone(anatomyState));

    state.byAnatomyId[state.anatomyId] = anatomyState;
  }
}

function onMeshSelect(state: State, index: number) {
  const anatomyState = state.byAnatomyId[state.anatomyId];
  anatomyState.meshes.meshIndex = index;
}

function onSelectAllMeshes(state: State) {
  const anatomyState = state.byAnatomyId[state.anatomyId];

  anatomyState.meshes.byIndex.forEach(
    (meshState) => (meshState.visible = true),
  );
}

function onUnselectAllMeshes(state: State) {
  const anatomyState = state.byAnatomyId[state.anatomyId];

  anatomyState.meshes.byIndex.forEach(
    (meshState) => (meshState.visible = false),
  );
}

function onReset(state: State) {
  const cachedState = anatomyStateCache.get(state.anatomyId);
  if (!cachedState) return;

  const anatomyState = state.byAnatomyId[state.anatomyId];

  anatomyState.volume.index = cachedState.volume.index;
  anatomyState.volume.show = cachedState.volume.show;

  anatomyState.volume.windowCenter = cachedState.volume.windowCenter;
  anatomyState.volume.windowWidth = cachedState.volume.windowWidth;

  anatomyState.volume.opacity = cachedState.volume.opacity;
  anatomyState.volume.dtScale = cachedState.volume.dtScale;

  anatomyState.volume.xMax = cachedState.volume.xMax;
  anatomyState.volume.xMin = cachedState.volume.xMin;

  anatomyState.volume.yMin = cachedState.volume.yMin;
  anatomyState.volume.yMax = cachedState.volume.yMax;

  anatomyState.volume.zMin = cachedState.volume.zMin;
  anatomyState.volume.zMax = cachedState.volume.zMax;

  anatomyState.meshes.opacity = cachedState.meshes.opacity;
  anatomyState.meshes.meshIndex = cachedState.meshes.meshIndex;
  anatomyState.meshes.clipRadius = cachedState.meshes.clipRadius;
  anatomyState.meshes.useClipSphere = cachedState.meshes.useClipSphere;

  anatomyState.meshes.byIndex.forEach((meshState, index) => {
    const cachedMeshState = cachedState.meshes.byIndex[index];
    meshState.color = cachedMeshState.color;
    meshState.visible = cachedMeshState.visible;
  });
}
