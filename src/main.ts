import type { ButtonApi, FolderApi, TabApi } from "tweakpane";

import "./style.css";
import { Server } from "./server";
import * as Ui from "./ui";
import { State } from "./state";
import * as Data from "./data";
import * as Render from "./render";

const state = State.create("thoracic");

let anatomy: Data.Anatomy | null = null;

const pane = Ui.createAnatomiesPane({
  state,
  onAnatomyChange: loadAndDisplayAnatomy,
});

let resetButton: ButtonApi | null = null;
let infoFolder: FolderApi | null = null;
let volumeFolder: FolderApi | null = null;
let meshesFolder: FolderApi | null = null;

const canvas = document.getElementById("gl-canvas") as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
if (!canvas) throw new Error("No canvas found");

const renderer = await Render.Renderer.create(canvas);

async function loadAndDisplayAnatomy(anatomyId: string) {
  if (resetButton) resetButton.dispose();
  if (infoFolder) infoFolder.dispose();
  if (volumeFolder) volumeFolder.dispose();
  if (meshesFolder) meshesFolder.dispose();

  state.progress = 0;

  const data = await Server.loadAnatomy(anatomyId, (a, b) => {
    state.progress = (a / b) * 100;
  });

  State.onAnatomyLoaded(state, data.anatomy, data.initialState);

  anatomy = data.anatomy;

  resetButton = Ui.addResetButton(pane, { onReset });
  infoFolder = Ui.addInfoFolder(pane, anatomy);
  volumeFolder = Ui.addVolumeFolder(pane, { anatomy, state, onVolumeChange });
  meshesFolder = Ui.addMeshesFolder(pane, {
    state,
    anatomy,
    onShowAllMeshes,
    onHideAllMeshes,
  });

  renderer.cameraNeedsReset = true;
  renderer.meshesNeedUpdate = true;
  renderer.volumeNeedsUpdate = true;
}
loadAndDisplayAnatomy(state.anatomyId);

window.onresize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize(canvas.width, canvas.height);
};

canvas.addEventListener("click", function (evt) {
  if (!anatomy || !evt.shiftKey || !meshesFolder) return;

  const index = renderer.pick(evt.clientX, evt.clientY, anatomy, state);
  if (index < 0) return;

  State.onMeshSelect(state, index);
  meshesFolder.refresh();
  (meshesFolder.children[1] as TabApi).pages[1].selected = true;
});

function onReset() {
  renderer.cameraNeedsReset = true;
  State.onReset(state);
  pane.refresh();
}

function onVolumeChange() {
  renderer.volumeNeedsUpdate = true;
}

function onShowAllMeshes() {
  State.onSelectAllMeshes(state);
  pane.refresh();
}

function onHideAllMeshes() {
  State.onUnselectAllMeshes(state);
  pane.refresh();
}

function onFrame() {
  if (anatomy) renderer.draw(anatomy, state);
  requestAnimationFrame(onFrame);
}
requestAnimationFrame(onFrame);
