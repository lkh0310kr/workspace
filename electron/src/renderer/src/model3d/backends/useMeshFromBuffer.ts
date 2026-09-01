import { useEffect, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import type { DetectedModelFormat } from "../../../../shared/model3d/types";
import { logModel3d } from "../model3dLog";

export interface MeshLoadStats {
  meshCount: number;
  triangleCount: number;
  materialCount: number;
}

function collectMeshStats(scene: THREE.Object3D): MeshLoadStats {
  let meshCount = 0;
  let triangleCount = 0;
  const materials = new Set<THREE.Material>();

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshCount += 1;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const position = geometry.attributes.position;
    if (position) triangleCount += Math.floor(position.count / 3);
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of meshMaterials) {
      if (material) materials.add(material);
    }
  });

  return { meshCount, triangleCount, materialCount: materials.size };
}

function decodeText(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function applyDefaultMaterial(scene: THREE.Object3D): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (!material || (Array.isArray(material) && material.length === 0)) {
      mesh.material = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.1, roughness: 0.85 });
    }
  });
}

function parseMeshBuffer(buffer: ArrayBuffer, format: DetectedModelFormat): THREE.Object3D {
  switch (format) {
    case "obj": {
      const group = new OBJLoader().parse(decodeText(buffer));
      applyDefaultMaterial(group);
      return group;
    }
    case "stl": {
      const geometry = new STLLoader().parse(buffer);
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.1, roughness: 0.85 });
      return new THREE.Mesh(geometry, material);
    }
    case "ply": {
      const geometry = new PLYLoader().parse(buffer);
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.1, roughness: 0.85 });
      return new THREE.Mesh(geometry, material);
    }
    case "dae": {
      const collada = new ColladaLoader().parse(decodeText(buffer), "");
      if (!collada) throw new Error("Failed to parse DAE");
      return collada.scene;
    }
    case "fbx": {
      const group = new FBXLoader().parse(buffer, "");
      applyDefaultMaterial(group);
      return group;
    }
    default:
      throw new Error(`Unsupported mesh format: ${format}`);
  }
}

async function loadMeshFromUrl(modelUrl: string, format: DetectedModelFormat): Promise<THREE.Object3D> {
  if (format === "obj") {
    const mtlUrl = modelUrl.replace(/\.obj$/i, ".mtl");
    const manager = new THREE.LoadingManager();
    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setResourcePath(modelUrl.slice(0, modelUrl.lastIndexOf("/") + 1));
    try {
      const materials = await mtlLoader.loadAsync(mtlUrl);
      materials.preload();
      const objLoader = new OBJLoader(manager);
      objLoader.setMaterials(materials);
      const group = await objLoader.loadAsync(modelUrl);
      applyDefaultMaterial(group);
      return group;
    } catch {
      const group = await new OBJLoader(manager).loadAsync(modelUrl);
      applyDefaultMaterial(group);
      return group;
    }
  }

  if (format === "fbx") {
    const group = await new FBXLoader().loadAsync(modelUrl);
    applyDefaultMaterial(group);
    return group;
  }

  throw new Error(`URL loading is not supported for format: ${format}`);
}

export function useMeshFromBuffer(
  modelData: ArrayBuffer | undefined,
  modelUrl: string | undefined,
  format: DetectedModelFormat,
): {
  scene: THREE.Object3D | null;
  error: Error | null;
  loading: boolean;
  stats: MeshLoadStats | null;
} {
  const [scene, setScene] = useState<THREE.Object3D | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MeshLoadStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setScene(null);
    setStats(null);

    void logModel3d("mesh_parse_start", {
      byteLength: modelData?.byteLength ?? null,
      modelUrl: modelUrl ?? null,
      format,
    });

    const finishOk = (parsed: THREE.Object3D) => {
      if (cancelled) return;
      const loadStats = collectMeshStats(parsed);
      void logModel3d("mesh_parse_ok", {
        byteLength: modelData?.byteLength ?? null,
        modelUrl: modelUrl ?? null,
        format,
        ...loadStats,
      });
      setScene(parsed);
      setStats(loadStats);
      setLoading(false);
    };

    const finishError = (err: unknown) => {
      if (cancelled) return;
      const loadError = err instanceof Error ? err : new Error(String(err));
      void logModel3d("mesh_parse_failed", {
        byteLength: modelData?.byteLength ?? null,
        modelUrl: modelUrl ?? null,
        format,
        error: loadError.message,
        stack: loadError.stack,
      });
      setError(loadError);
      setLoading(false);
    };

    if (modelUrl) {
      void loadMeshFromUrl(modelUrl, format).then(finishOk).catch(finishError);
      return () => {
        cancelled = true;
      };
    }

    if (!modelData) {
      finishError(new Error("Mesh model requires modelData or modelUrl"));
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (cancelled) return;
      try {
        finishOk(parseMeshBuffer(modelData, format));
      } catch (err) {
        finishError(err);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [modelData, modelUrl, format]);

  return { scene, error, loading, stats };
}
