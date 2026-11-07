import { useEffect, useRef, useState } from "react";
import {
  onFileChanged,
  openModelPreview,
  readFileBinaryPreview,
  type SceneManifest,
} from "../../electron";
import type { SceneManifest as Manifest } from "../../../../shared/model3d/types";
import { logModel3d } from "../model3dLog";
import { shouldReloadModelPreview, withModelCacheBust } from "./modelPreviewWatch";

export type ModelPreviewPhase = "idle" | "opening" | "loading" | "ready" | "unsupported" | "error";

export interface ModelPreviewState {
  phase: ModelPreviewPhase;
  manifest: Manifest | null;
  modelData: ArrayBuffer | null;
  modelUrl: string | null;
  error: string | null;
  /** True while a live fs refresh is in flight (previous mesh stays visible). */
  refreshing: boolean;
  /** Bumps on each successful load — cache keys / UI flash. */
  revision: number;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function readPreviewWithRetry(
  tabId: number,
  path: string,
  soft: boolean,
): Promise<{ content: string } | null> {
  const first = await readFileBinaryPreview(tabId, path);
  if (first || !soft) return first;
  // Agent mid-write race: brief retry before surfacing a soft error.
  await new Promise((r) => setTimeout(r, 120));
  return readFileBinaryPreview(tabId, path);
}

export function useModelPreview(tabId: number, filePath: string | null): ModelPreviewState {
  const [state, setState] = useState<ModelPreviewState>({
    phase: "idle",
    manifest: null,
    modelData: null,
    modelUrl: null,
    error: null,
    refreshing: false,
    revision: 0,
  });
  const [reloadNonce, setReloadNonce] = useState(0);
  const hasContentRef = useRef(false);
  const revisionRef = useRef(0);

  useEffect(() => {
    hasContentRef.current = false;
    revisionRef.current = 0;
    setReloadNonce(0);
  }, [filePath]);

  // Vibe-CAD: Claude Code / terminal writes mesh → fs:changed → soft reload.
  // Pattern from ref-proj/yet-another-cad-viewer (change watch → refresh model).
  useEffect(() => {
    if (!filePath) return;
    return onFileChanged((paths) => {
      if (!shouldReloadModelPreview(filePath, paths)) return;
      void logModel3d("preview_fs_changed", { tabId, filePath, paths });
      setReloadNonce((n) => n + 1);
    });
  }, [tabId, filePath]);

  useEffect(() => {
    if (!filePath) {
      void logModel3d("preview_idle", { tabId, filePath: null });
      setState({
        phase: "idle",
        manifest: null,
        modelData: null,
        modelUrl: null,
        error: null,
        refreshing: false,
        revision: 0,
      });
      return;
    }

    let cancelled = false;
    const path = filePath;
    const soft = hasContentRef.current;

    async function load() {
      void logModel3d(soft ? "preview_refreshing" : "preview_opening", {
        tabId,
        filePath: path,
        reloadNonce,
      });

      if (soft) {
        setState((prev) => ({ ...prev, refreshing: true, error: null }));
      } else {
        setState({
          phase: "opening",
          manifest: null,
          modelData: null,
          modelUrl: null,
          error: null,
          refreshing: false,
          revision: revisionRef.current,
        });
      }

      try {
        const manifest = (await openModelPreview(tabId, path)) as SceneManifest;
        if (cancelled) return;

        void logModel3d("preview_manifest", {
          tabId,
          filePath: path,
          status: manifest.status,
          format: manifest.source.format,
          soft,
        });

        if (manifest.status === "unsupported") {
          void logModel3d("preview_unsupported", {
            tabId,
            filePath: path,
            format: manifest.source.format,
            message: manifest.message,
          });
          hasContentRef.current = false;
          setState({
            phase: "unsupported",
            manifest,
            modelData: null,
            modelUrl: null,
            error: manifest.message,
            refreshing: false,
            revision: revisionRef.current,
          });
          return;
        }

        if (manifest.readStrategy === "workspace-model") {
          revisionRef.current += 1;
          const revision = revisionRef.current;
          const modelUrl = withModelCacheBust(manifest.modelUrl, revision);
          void logModel3d("preview_ready_url", {
            tabId,
            filePath: path,
            modelUrl,
            mimeType: manifest.mimeType,
            revision,
            soft,
          });
          hasContentRef.current = true;
          setState({
            phase: "ready",
            manifest,
            modelData: null,
            modelUrl,
            error: null,
            refreshing: false,
            revision,
          });
          return;
        }

        if (!soft) {
          setState((prev) => ({ ...prev, phase: "loading", manifest, modelUrl: null }));
        }
        void logModel3d("preview_loading_binary", {
          tabId,
          filePath: path,
          mimeType: manifest.mimeType,
        });
        const preview = await readPreviewWithRetry(tabId, path, soft);
        if (cancelled) return;
        if (!preview) {
          void logModel3d("preview_binary_missing", {
            tabId,
            filePath: path,
            mimeType: manifest.mimeType,
          });
          if (soft) {
            setState((prev) => ({
              ...prev,
              refreshing: false,
              error: "파일을 다시 읽을 수 없습니다. 저장 직후 자동으로 다시 시도합니다.",
            }));
            return;
          }
          setState({
            phase: "error",
            manifest,
            modelData: null,
            modelUrl: null,
            error:
              "파일을 읽을 수 없습니다. Application Support/workspace-app-dev/logs/model3d.ndjson 로그를 확인하세요.",
            refreshing: false,
            revision: revisionRef.current,
          });
          return;
        }

        const modelData = base64ToArrayBuffer(preview.content);
        revisionRef.current += 1;
        const revision = revisionRef.current;
        void logModel3d("preview_ready", {
          tabId,
          filePath: path,
          byteLength: modelData.byteLength,
          mimeType: manifest.mimeType,
          revision,
          soft,
        });
        hasContentRef.current = true;
        setState({
          phase: "ready",
          manifest,
          modelData,
          modelUrl: null,
          error: null,
          refreshing: false,
          revision,
        });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "모델을 불러오지 못했습니다.";
        void logModel3d("preview_error", {
          tabId,
          filePath: path,
          error: message,
          stack: err instanceof Error ? err.stack : undefined,
          soft,
        });
        if (soft) {
          setState((prev) => ({ ...prev, refreshing: false, error: message }));
          return;
        }
        setState({
          phase: "error",
          manifest: null,
          modelData: null,
          modelUrl: null,
          error: message,
          refreshing: false,
          revision: revisionRef.current,
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
      void logModel3d("preview_dispose", { tabId, filePath: path, reloadNonce });
    };
  }, [tabId, filePath, reloadNonce]);

  return state;
}
