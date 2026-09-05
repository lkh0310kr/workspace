import { net, protocol } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { MODEL_MIME_TYPES, MODEL_SCHEME, modelUrlToAbsolutePath } from "./modelProtocolUrl";

export { MODEL_MIME_TYPES, MODEL_SCHEME, modelUrlToAbsolutePath, toModelUrl } from "./modelProtocolUrl";

export function registerModelProtocol(getAllowedRoots: () => string[]): void {
  protocol.handle(MODEL_SCHEME, async (request) => {
    const absolutePath = modelUrlToAbsolutePath(request.url);
    if (!absolutePath) {
      return new Response("bad request", { status: 400 });
    }

    let realPath: string;
    try {
      realPath = fs.realpathSync(absolutePath);
    } catch {
      return new Response("not found", { status: 404 });
    }

    const confined = getAllowedRoots().some((root) => {
      try {
        const realRoot = fs.realpathSync(root);
        return realPath === realRoot || realPath.startsWith(realRoot + path.sep);
      } catch {
        return false;
      }
    });
    if (!confined) {
      return new Response("forbidden", { status: 403 });
    }

    const contentType = MODEL_MIME_TYPES[path.extname(realPath).toLowerCase()];
    if (!contentType) {
      return new Response("unsupported type", { status: 415 });
    }

    // net.fetch(file://) is more reliable than Readable.toWeb streams for
    // renderer fetch() + Three.js FileLoader (Electron #41962).
    const fileResponse = await net.fetch(pathToFileURL(realPath).toString());
    const headers = new Headers(fileResponse.headers);
    headers.set("content-type", contentType);
    headers.set("access-control-allow-origin", "*");
    // Vibe-CAD live reload: never let Chromium / Three FileLoader cache a stale mesh.
    headers.set("cache-control", "no-store, max-age=0");
    return new Response(fileResponse.body, {
      status: fileResponse.status,
      statusText: fileResponse.statusText,
      headers,
    });
  });
}
