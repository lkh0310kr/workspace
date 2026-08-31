// Pure extension classification for the File Viewer pane, split out from
// FileViewerContent.tsx so it's independently testable and so the
// component can decide *before* fetching whether to go through the small
// binary-preview IPC (images/PDF — base64+blob, fine for whole small
// files) or the streaming media protocol (video/audio — never loaded
// whole into memory, see mediaProtocol.ts).

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv"];
const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];

export type MediaKind = "image" | "pdf" | "video" | "audio" | "epub" | "model3d" | "other";

const MODEL3D_EXTENSIONS = [".glb", ".gltf", ".fbx", ".obj", ".stl", ".ply", ".dae"];

export function classifyMediaExtension(filePath: string): MediaKind {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".epub")) return "epub";
  if (MODEL3D_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "model3d";
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "image";
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";
  if (AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "audio";
  return "other";
}
