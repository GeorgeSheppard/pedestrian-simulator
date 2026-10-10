import { type ReactNode, useLayoutEffect, useRef } from 'react';
import {
  type BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  type Group,
  type InstancedMesh,
  type Material,
  Matrix3,
  Matrix4,
  Mesh,
  type Object3D,
  Vector3,
} from 'three';

/**
 * Draws everything inside it that looks the same, down to the material settings and whether it
 * casts and catches shadows, as a single mesh: the street furniture, the station and so on are
 * hundreds of little meshes, each of which would otherwise be drawn on its own, twice over with
 * the shadows. A mesh with several materials is split up between them. What's inside is merged
 * once, when it first appears, so it must stay put relative to this group; the group as a whole
 * can still move. Alike materials are drawn as one of them, so a material can be changed later,
 * as the brake lights' are, only if nothing else in the batch started out looking the same.
 *
 * Instanced meshes, meshes with anything see-through, and meshes with `userData.batch` set to
 * false are left to draw themselves.
 */
export function StaticBatch({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    return batch(ref.current);
  }, []);
  return <group ref={ref}>{children}</group>;
}

/** The part of a mesh drawn with one material: `count` indices, or vertices, from `start`. */
interface Piece {
  mesh: Mesh;
  material: Material;
  start: number;
  count: number;
}

/** Merges the meshes under `group`, hiding the originals. Returns a function that undoes it. */
function batch(group: Group): () => void {
  group.updateWorldMatrix(true, true);
  const toLocal = group.matrixWorld.clone().invert();

  const sets = new Map<string, Piece[]>();
  group.traverseVisible((object) => {
    for (const piece of piecesOf(object)) {
      const key = [
        lookOf(piece.material),
        piece.mesh.castShadow,
        piece.mesh.receiveShadow,
        'uv' in piece.mesh.geometry.attributes,
      ].join('|');
      const set = sets.get(key);
      if (set) set.push(piece);
      else sets.set(key, [piece]);
    }
  });

  const merged: Mesh[] = [];
  const hidden = new Set<Mesh>();
  for (const pieces of sets.values()) {
    const first = pieces[0]!;
    // A whole mesh with nothing like it may as well draw itself.
    if (pieces.length === 1 && !Array.isArray(first.mesh.material)) continue;
    const mesh = new Mesh(mergeGeometry(pieces, toLocal), first.material);
    mesh.castShadow = first.mesh.castShadow;
    mesh.receiveShadow = first.mesh.receiveShadow;
    group.add(mesh);
    merged.push(mesh);
    for (const piece of pieces) hidden.add(piece.mesh);
  }
  // Turned off by layer rather than hidden, so anything parented to them still draws.
  const layers = [...hidden].map((mesh) => mesh.layers.mask);
  for (const mesh of hidden) mesh.layers.disableAll();

  return () => {
    for (const mesh of merged) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    [...hidden].forEach((mesh, i) => (mesh.layers.mask = layers[i]!));
  };
}

/** The pieces of a mesh, one per material, or none if it isn't one to merge. */
function piecesOf(object: Object3D): Piece[] {
  const mesh = object as Mesh;
  if (!mesh.isMesh || (mesh as InstancedMesh).isInstancedMesh || mesh.userData.batch === false) {
    return [];
  }
  const { index, attributes, morphAttributes, drawRange, groups } = mesh.geometry;
  if (!attributes.position || !attributes.normal || Object.keys(morphAttributes).length > 0) {
    return [];
  }
  if (drawRange.start !== 0 || drawRange.count !== Infinity) return [];
  const total = index?.count ?? attributes.position.count;
  const pieces: Piece[] = Array.isArray(mesh.material)
    ? groups.map((g) => ({
        mesh,
        material: (mesh.material as Material[])[g.materialIndex ?? 0]!,
        start: g.start,
        count: Math.min(g.count, total - g.start),
      }))
    : [{ mesh, material: mesh.material, start: 0, count: total }];
  const opaque = pieces.every((p) => p.material && p.material.visible && !p.material.transparent);
  return opaque ? pieces : [];
}

/** Fields that don't change how a material looks. */
const IGNORED = new Set(['uuid', 'id', 'name', 'version', 'userData', '_listeners', '__r3f']);

/** A description of everything that sets how a material looks, the same for any that look alike. */
function lookOf(material: Material): string {
  const parts = [material.type];
  for (const [name, value] of Object.entries(material)) {
    if (IGNORED.has(name) || typeof value === 'function') continue;
    parts.push(`${name}=${describe(value)}`);
  }
  return parts.join(';');
}

function describe(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value);
  // Textures, by which one they are.
  if ('uuid' in value) return String(value.uuid);
  // Colours, vectors and rotations, by their numbers.
  if ('toArray' in value && typeof value.toArray === 'function') {
    return (value.toArray() as unknown[]).join();
  }
  return JSON.stringify(value);
}

/**
 * The pieces as one geometry, in `toLocal`'s space: positions, normals and, if they all have them,
 * texture coordinates.
 */
function mergeGeometry(pieces: Piece[], toLocal: Matrix4): BufferGeometry {
  const withUv = pieces.every((piece) => 'uv' in piece.mesh.geometry.attributes);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const matrix = new Matrix4();
  const normalMatrix = new Matrix3();
  const vector = new Vector3();
  for (const { mesh, start, count } of pieces) {
    const { index, attributes } = mesh.geometry;
    const position = attributes.position as BufferAttribute;
    const normal = attributes.normal as BufferAttribute;
    const uv = attributes.uv as BufferAttribute | undefined;
    matrix.multiplyMatrices(toLocal, mesh.matrixWorld);
    normalMatrix.getNormalMatrix(matrix);

    // Each of the piece's vertices copied across once, by where it was to where it is now.
    const copied = new Map<number, number>();
    const vertex = (i: number) => {
      let at = copied.get(i);
      if (at === undefined) {
        at = positions.length / 3;
        copied.set(i, at);
        vector.fromBufferAttribute(position, i).applyMatrix4(matrix);
        positions.push(vector.x, vector.y, vector.z);
        vector.fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix);
        normals.push(vector.x, vector.y, vector.z);
        if (withUv && uv) uvs.push(uv.getX(i), uv.getY(i));
      }
      return at;
    };

    // A mirroring transform turns triangles inside out, so wind them the other way.
    const mirrored = matrix.determinant() < 0;
    for (let i = start; i + 2 < start + count; i += 3) {
      const a = vertex(index ? index.getX(i) : i);
      const b = vertex(index ? index.getX(i + 1) : i + 1);
      const c = vertex(index ? index.getX(i + 2) : i + 2);
      indices.push(a, mirrored ? c : b, mirrored ? b : c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  if (withUv) geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}
