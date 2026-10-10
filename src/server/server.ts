import * as Lib from "../lib";
import * as Data from "../data";
import { State } from "../state";

export const Server = {
  loadAnatomy,
};

//

const cache = new Map<string, WeakRef<Data.Anatomy>>();

const textDecoder = new TextDecoder("utf-8");

async function loadAnatomy(id: string, onProgress: Lib.ProgressCallback) {
  const anatomyRef = cache.get(id);
  if (anatomyRef) {
    const anatomy = anatomyRef.deref();

    if (anatomy) {
      onProgress(1, 1);
      return { anatomy };
    }
  }

  const bytes = await Lib.requestBytes(`anatomies/${id}.tar.gz`, onProgress);
  const files = await Lib.TarFile.parse(bytes);

  const meshes: Array<Data.Mesh> = [];
  const volumes: Array<Data.Volume> = [];
  let initialState: State["byAnatomyId"][string] | null = null;
  let info: Data.Anatomy["info"] = { description: "", url: "" };

  for (const { name, data } of files) {
    const filename = name.split("/").filter(Boolean).pop(); // Last component of the path
    if (!filename) throw new Error("Missing file name");

    const filenameNoExt = filename.replace(/\.[^/.]+$/, "");

    if (name.includes("/meshes/")) {
      const { points, indices } = new Lib.VtkParser(data).parse();

      const label = filenameNoExt
        .replace(/^Model_\d+_/, "")
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");

      meshes.push({
        points,
        indices,
        label,
      });
    } else if (name.includes("/volumes/")) {
      const nrrd = await Lib.Nrrd.parse(data);
      const volume = Data.Volume.fromNrrd(nrrd, filenameNoExt);
      volumes.push(volume);
    } else if (name.includes("/initial_state.txt")) {
      initialState = JSON.parse(textDecoder.decode(data));
    } else if (name.includes("/info.txt")) {
      info = JSON.parse(textDecoder.decode(data));
    }
  }

  const anatomy = Data.Anatomy.create({ id, volumes, meshes, info });
  cache.set(id, new WeakRef(anatomy));

  return { anatomy, initialState };
}
