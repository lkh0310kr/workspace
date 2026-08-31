import { useEffect, useState } from "react";
import { openModelPreview, readFileBinaryPreview, type SceneManifest } from "../../electron";
import type { SceneManifest as Manifest } from "../../../../shared/model3d/types";
import { logModel3d } from "../model3dLog";

export type ModelPreviewPhase = "idle" | "opening" | "loading" | "ready" | "unsupported" | "error";

export interface ModelPreviewState {
  phase: ModelPreviewPhase;
  manifest: Manifest | null;
  modelData: ArrayBuffer | null;
  error: string | null;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function useModelPreview(tabId: number, filePath: string | null): ModelPreviewState {
  const [state, setState] = useState<ModelPreviewState>({
    phase: "idle",
    manifest: null,
    modelData: null,
    error: null,
  });

  useEffect(() => {
    if (!filePath) {
      void logModel3d("preview_idle", { tabId, filePath: null });
      setState({ phase: "idle", manifest: null, modelData: null, error: null });
      return;
    }

    let cancelled = false;
    const path = filePath;

    async function load() {
      void logModel3d("preview_opening", { tabId, filePath: path });
      setState({ phase: "opening", manifest: null, modelData: null, error: null });
      try {
        const manifest = (await openModelPreview(tabId, path)) as SceneManifest;
        if (cancelled) return;

        void logModel3d("preview_manifest", {
          tabId,
          filePath: path,
          status: manifest.status,
          format: manifest.source.format,
        });

        if (manifest.status === "unsupported") {
          void logModel3d("preview_unsupported", {
            tabId,
            filePath: path,
            format: manifest.source.format,
            message: manifest.message,
          });
          setState({ phase: "unsupported", manifest, modelData: null, error: manifest.message });
          return;
        }

        setState((prev) => ({ ...prev, phase: "loading", manifest }));
        void logModel3d("preview_loading_binary", { tabId, filePath: path, mimeType: manifest.mimeType });
        const preview = await readFileBinaryPreview(tabId, path);
        if (cancelled) return;
        if (!preview) {
          void logModel3d("preview_binary_missing", { tabId, filePath: path, mimeType: manifest.mimeType });
          setState({
            phase: "error",
            manifest,
            modelData: null,
            error: "파일을 읽을 수 없습니다. model3d.ndjson 로그를 확인하세요.",
          });
          return;
        }

        const modelData = base64ToArrayBuffer(preview.content);
        void logModel3d("preview_ready", {
          tabId,
          filePath: path,
          byteLength: modelData.byteLength,
          mimeType: manifest.mimeType,
        });
        setState({ phase: "ready", manifest, modelData, error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "모델을 불러오지 못했습니다.";
        void logModel3d("preview_error", {
          tabId,
          filePath: path,
          error: message,
          stack: err instanceof Error ? err.stack : undefined,
        });
        setState({
          phase: "error",
          manifest: null,
          modelData: null,
          error: message,
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
      void logModel3d("preview_dispose", { tabId, filePath: path });
    };
  }, [tabId, filePath]);

  return state;
}
