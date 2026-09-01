import { protocol } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { Readable } from "node:stream";
import { MODEL_MIME_TYPES, MODEL_SCHEME } from "./modelProtocolUrl";

const MODEL_HOST = "local";

protocol.registerSchemesAsPrivileged([
  {
    scheme: MODEL_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

export { MODEL_MIME_TYPES, MODEL_SCHEME, toModelUrl } from "./modelProtocolUrl";

export function registerModelProtocol(getAllowedRoots: () => string[]): void {
  protocol.handle(MODEL_SCHEME, async (request) => {
    let absolutePath: string;
    try {
      const url = new URL(request.url);
      if (url.hostname !== MODEL_HOST) {
        return new Response("bad request", { status: 400 });
      }
      absolutePath = decodeURIComponent(url.pathname);
    } catch {
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

    let size: number;
    try {
      size = fs.statSync(realPath).size;
    } catch {
      return new Response("read error", { status: 500 });
    }

    const nodeStream = fs.createReadStream(realPath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-length": String(size),
        "access-control-allow-origin": "*",
      },
    });
  });
}
