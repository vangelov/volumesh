import type { ButtonApi, FolderApi, TabApi } from "tweakpane";

import "./style.css";
import { Server } from "./server";
import * as Ui from "./ui";
import { State } from "./state";
import * as Data from "./data";
import * as Render from "./render";

import { importDicomData } from "./lib/dicom";

const importedAnatomies = new Map<string, Data.Anatomy>();

const state = State.create("thoracic");

let anatomy: Data.Anatomy | null = null;

const pane = Ui.createAnatomiesPane({
  state,
  onAnatomyChange: loadAndDisplayAnatomy,
});

const folderInput = document.createElement("input");
folderInput.type = "file";
folderInput.setAttribute("webkitdirectory", "");
folderInput.multiple = true;
const importButton = pane.addButton({ title: "Import DICOM Folder" });
importButton.on("click", () => folderInput.click());
folderInput.addEventListener("change", async () => {
  const files = Array.from(folderInput.files || []);
  if (!files.length) return;
  importButton.disabled = true;
  state.progress = 0;
  try {
    const { volumes, meshes, warnings } = await importDicomData(
      files,
      (done, total) => {
        state.progress = (done / total) * 100;
      },
    );
    const name = files[0].webkitRelativePath.split("/")[0] || "DICOM";
    const id = `dicom-${crypto.randomUUID()}`;
    const imported = Data.Anatomy.create({
      id,
      volumes,
      meshes,
      boundsFrom: "volumes",
      info: {
        description: `${name}: ${volumes.length} DICOM volume(s), ${meshes.length} RTSTRUCT mesh(es). Patient LPS geometry converted to RAS. ${warnings.join(" ")}`,
        url: "",
      },
    });
    importedAnatomies.set(id, imported);
    Ui.addAnatomyOption(pane, id, name);
    state.anatomyId = id;
    await loadAndDisplayAnatomy(id);
    pane.refresh();
  } catch (error) {
    console.error(error);
    window.alert(
      `DICOM import failed: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    importButton.disabled = false;
    folderInput.value = "";
  }
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

let loadVersion = 0;

async function loadAndDisplayAnatomy(anatomyId: string) {
  console.log("fuck");
  const version = ++loadVersion;

  state.progress = 0;

  const imported = importedAnatomies.get(anatomyId);
  const data = imported
    ? { anatomy: imported, initialState: null }
    : await Server.loadAnatomy(anatomyId, (a, b) => {
        state.progress = (a / b) * 100;
      });

  if (version !== loadVersion) return;
  state.anatomyId = anatomyId;
  if (resetButton) resetButton.dispose();
  if (infoFolder) infoFolder.dispose();
  if (volumeFolder) volumeFolder.dispose();
  if (meshesFolder) meshesFolder.dispose();

  State.onAnatomyLoaded(state, data.anatomy, data.initialState);

  anatomy = data.anatomy;

  resetButton = Ui.addResetButton(pane, { onReset });
  infoFolder = Ui.addInfoFolder(pane, anatomy);
  volumeFolder = Ui.addVolumeFolder(pane, { anatomy, state, onVolumeChange });
  meshesFolder = anatomy.meshes.length
    ? Ui.addMeshesFolder(pane, {
        state,
        anatomy,
        onShowAllMeshes,
        onHideAllMeshes,
      })
    : null;

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
