import type { PkmsWorkspace } from "@pkms/protocol/types";

export interface Env {
  ASSET_BUCKET: R2Bucket;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  DATA_ENCRYPTION_KEY: string;
  PUBLIC_ORIGIN: string;
  PKMS_WEB_ORIGIN: string;
  PKMS_WEB: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  PKMS_REALTIME_PRIVATE_KEY: string;
  PKMS_REALTIME_KEY_ID: string;
  WORKSPACE_HOME_AUDIENCE?: string;
}

export interface Session {
  login: string;
  avatarUrl?: string;
  expiresAt: number;
  scopes?: string[];
  tokenType?: "mcp";
  audience?: string;
  tokenId?: string;
}

export type WorkspaceRecord = PkmsWorkspace;
