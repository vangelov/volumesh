import * as Lib from "../lib";
import { Mesh } from "./mesh";
import { Volume } from "./volume";
import { World } from "./world";

export type Anatomy = {
  id: string;
  info: {
    description: string;
    url: string;
  };
  volumes: Array<Volume>;
  meshes: Array<Mesh>;
  world: World;
};

export const Anatomy = {
  create,
};

type CreateParams = Pick<Anatomy, "id" | "info" | "volumes" | "meshes">;

function create({ id, info, volumes, meshes }: CreateParams): Anatomy {
  const world = World.fromMeshes(meshes);

  const sortedNormalizedMeshes = Mesh.sort(meshes).map((mesh) =>
    Lib.pipe(
      mesh,
      (mesh: Mesh) => Mesh.normalize(mesh, world),
      Mesh.updateCenter,
      Mesh.updateNormals,
    ),
  );

  const registeredVolumes = volumes.map((volume) =>
    Volume.register(volume, world),
  );

  return {
    id,
    info,
    volumes: registeredVolumes,
    meshes: sortedNormalizedMeshes,
    world,
  };
}
