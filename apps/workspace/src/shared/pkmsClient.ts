export type PkmsUploadPart =
  | { name: string; value: string }
  | {
      name: string;
      fileName: string;
      contentType: string;
      bytes: Uint8Array;
    };

export type PkmsRequestBody =
  | { kind: "json"; value: string }
  | { kind: "multipart"; parts: PkmsUploadPart[] };

export interface PkmsRequestOptions {
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: PkmsRequestBody;
}

export interface PkmsResponse<T = unknown> {
  status: number;
  requestId?: string;
  body: T;
}

export interface PkmsAssetResponse {
  bytes: Uint8Array;
  contentType: string;
}
