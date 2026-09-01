import { useEffect, useState } from "react";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { ColladaLoader } from "three/examples/jsm/loaders/ColladaLoader.js";
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

function parseMeshBuffer(buffer: ArrayBuffer, format: DetectedModelFormat): THREE.Object3D {
  switch (format) {
    case "obj": {
      const group = new OBJLoader().parse(decodeText(buffer));
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = mesh.material;
        if (!material || (Array.isArray(material) && material.length === 0)) {
          mesh.material = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.1, roughness: 0.85 });
        }
      });
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
      return collada.scene;
    }
    default:
      throw new Error(`Unsupported mesh format: ${format}`);
  }
}

export function useMeshFromBuffer(
  buffer: ArrayBuffer,
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

    void logModel3d("mesh_parse_start", { byteLength: buffer.byteLength, format });

    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const parsed = parseMeshBuffer(buffer, format);
        const loadStats = collectMeshStats(parsed);
        void logModel3d("mesh_parse_ok", { byteLength: buffer.byteLength, format, ...loadStats });
        setScene(parsed);
        setStats(loadStats);
        setLoading(false);
      } catch (err) {
        const loadError = err instanceof Error ? err : new Error(String(err));
        void logModel3d("mesh_parse_failed", {
          byteLength: buffer.byteLength,
          format,
          error: loadError.message,
          stack: loadError.stack,
        });
        setError(loadError);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [buffer, format]);

  return { scene, error, loading, stats };
}
