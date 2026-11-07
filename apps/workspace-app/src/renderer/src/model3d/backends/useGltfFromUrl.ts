import { useEffect, useState } from "react";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { logModel3d } from "../model3dLog";
import { configureGltfLoader } from "./gltfLoaderSetup";

export interface GltfLoadStats {
  meshCount: number;
  triangleCount: number;
  materialCount: number;
}

function collectGltfStats(scene: THREE.Object3D): GltfLoadStats {
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

function createConfiguredLoader(renderer?: THREE.WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader();
  configureGltfLoader(loader, renderer);
  return loader;
}

export function useGltfFromBuffer(buffer: ArrayBuffer): {
  gltf: GLTF | null;
  error: Error | null;
  loading: boolean;
  stats: GltfLoadStats | null;
} {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GltfLoadStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = createConfiguredLoader();

    setLoading(true);
    setError(null);
    setGltf(null);
    setStats(null);

    void logModel3d("gltf_parse_start", { byteLength: buffer.byteLength });

    loader
      .parseAsync(buffer.slice(0), "")
      .then((parsed) => {
        if (cancelled) return;
        const loadStats = collectGltfStats(parsed.scene);
        void logModel3d("gltf_parse_ok", {
          byteLength: buffer.byteLength,
          ...loadStats,
        });
        setGltf(parsed);
        setStats(loadStats);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const loadError = err instanceof Error ? err : new Error(String(err));
        void logModel3d("gltf_parse_failed", {
          byteLength: buffer.byteLength,
          error: loadError.message,
          stack: loadError.stack,
        });
        setError(loadError);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [buffer]);

  return { gltf, error, loading, stats };
}

export function useGltfFromUrl(
  url: string,
  renderer?: THREE.WebGLRenderer,
): {
  gltf: GLTF | null;
  error: Error | null;
  loading: boolean;
  stats: GltfLoadStats | null;
} {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<GltfLoadStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = createConfiguredLoader(renderer);

    setLoading(true);
    setError(null);
    setGltf(null);
    setStats(null);

    void logModel3d("gltf_load_start", { url });

    loader
      .loadAsync(url)
      .then((parsed) => {
        if (cancelled) return;
        const loadStats = collectGltfStats(parsed.scene);
        void logModel3d("gltf_load_ok", { url, ...loadStats });
        setGltf(parsed);
        setStats(loadStats);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        const loadError = err instanceof Error ? err : new Error(String(err));
        void logModel3d("gltf_load_failed", {
          url,
          error: loadError.message,
          stack: loadError.stack,
        });
        setError(loadError);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, renderer]);

  return { gltf, error, loading, stats };
}
