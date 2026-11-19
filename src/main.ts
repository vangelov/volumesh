import type { ButtonApi, FolderApi, TabApi } from "tweakpane";

import "./style.css";
import { Server } from "./server";
import * as Ui from "./ui";
import { State } from "./state";
import * as Data from "./data";
import * as Render from "./render";

import { importDicomData } from "./lib/dicom";
import { DEFAULT_RECONSTRUCTION } from "./lib/rtstruct";
import type { ReconstructionMethod } from "./lib/rtstruct";
import type { ReconstructionResult } from "./lib/reconstruct";

const importedAnatomies = new Map<string, Data.Anatomy>();
const reconstructions = new Map<string, {
  method: ReconstructionMethod;
  reconstruct: (method: ReconstructionMethod) => Promise<ReconstructionResult>;
  description: string;
}>();
const meshSettings = { method: DEFAULT_RECONSTRUCTION, status: 'Select a method before import, or compare after importing.' };

const state = State.create("thoracic");

let anatomy: Data.Anatomy | null = null;

const pane = Ui.createAnatomiesPane({
  state,
  onAnatomyChange: loadAndDisplayAnatomy,
});

const reconstructionFolder = pane.addFolder({ title: 'RTSTRUCT Reconstruction', expanded: true });
const methodBinding = reconstructionFolder.addBinding(meshSettings, 'method', {
  label: 'Method', options: [
    { text: 'Smoothed surface nets (default)', value: 'smooth' },
    { text: 'Surface nets', value: 'surface-nets' },
    { text: 'Voxel boundaries (original)', value: 'voxel' },
  ],
});
reconstructionFolder.addBinding(meshSettings, 'status', { label: 'Status', readonly: true });
methodBinding.on('change', () => { void changeReconstructionMethod(); });

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
  methodBinding.disabled = true;
  const method = meshSettings.method;
  state.progress = 0;
  try {
    const { volumes, meshes, warnings, reconstruct } = await importDicomData(
      files,
      (done, total) => {
        state.progress = (done / total) * 100;
      },
      method,
    );
    const name = files[0].webkitRelativePath.split("/")[0] || "DICOM";
    const id = `dicom-${crypto.randomUUID()}`;
    const imported = Data.Anatomy.create({
      id,
      volumes,
      meshes,
      boundsFrom: "volumes",
      info: {
        description: `${name}: ${volumes.length} DICOM volume(s), ${meshes.length} RTSTRUCT mesh(es). Patient LPS geometry converted to RAS. Reconstruction: ${method}. ${warnings.join(" ")}`,
        url: "",
      },
    });
    if (reconstruct) reconstructions.set(id, { method, reconstruct, description: name });
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
    methodBinding.disabled = false;
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
  const reconstruction = reconstructions.get(anatomyId);
  if (reconstruction) meshSettings.method = reconstruction.method;
  meshSettings.status = reconstruction ? `${anatomy.meshes.length} structures · ${reconstruction.method}` : 'Method applies to the next DICOM import.';
  reconstructionFolder.refresh();

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

async function changeReconstructionMethod() {
  const source = anatomy;
  const entry = source && reconstructions.get(source.id);
  const method = meshSettings.method;
  if (!source || !entry || entry.method === method) return;
  methodBinding.disabled = true;
  importButton.disabled = true;
  meshSettings.status = 'Rebuilding meshes…';
  reconstructionFolder.refresh();
  try {
    const result = await entry.reconstruct(method);
    // Normalize against the existing world; preserve the image transform and camera.
    const meshes = Data.Mesh.sort(result.meshes).map(mesh => Data.Mesh.updateNormals(
      Data.Mesh.updateCenter(Data.Mesh.normalize(mesh, source.world)),
    ));
    const anatomyState = state.byAnatomyId[source.id];
    const previous = new Map(source.meshes.map((mesh, index) => [mesh.label, anatomyState.meshes.byIndex[index]]));
    const selected = source.meshes[anatomyState.meshes.meshIndex]?.label;
    anatomyState.meshes.byIndex = meshes.map(mesh => previous.get(mesh.label) || { visible: true, color: mesh.color || [0.7, 0.7, 0.7] });
    anatomyState.meshes.meshIndex = Math.max(0, meshes.findIndex(mesh => mesh.label === selected));
    source.meshes = meshes;
    source.info.description = `${entry.description}: ${source.volumes.length} DICOM volume(s), ${meshes.length} RTSTRUCT mesh(es). Reconstruction: ${method}. ${result.warnings.join(' ')}`;
    entry.method = method;
    if (anatomy === source) {
      meshesFolder?.dispose();
      meshesFolder = meshes.length ? Ui.addMeshesFolder(pane, { state, anatomy: source, onShowAllMeshes, onHideAllMeshes }) : null;
      infoFolder?.dispose();
      infoFolder = Ui.addInfoFolder(pane, source);
      renderer.meshesNeedUpdate = true;
      meshSettings.status = `${meshes.length} structures · ${method}`;
    }
  } catch (error) {
    if (anatomy === source) {
      meshSettings.method = entry.method;
      meshSettings.status = 'Reconstruction failed; previous meshes retained.';
    }
    window.alert(error instanceof Error ? error.message : 'Mesh reconstruction failed.');
  } finally {
    methodBinding.disabled = false;
    importButton.disabled = false;
    // A programmatic refresh can emit a change event; the method equality guard avoids rebuilding.
    if (anatomy !== source && anatomy) {
      const current = reconstructions.get(anatomy.id);
      if (current) meshSettings.method = current.method;
    }
    reconstructionFolder.refresh();
  }
}

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
