export interface Session {
  id: number;
  title: string;
  kind: "local" | "ssh";
  params?: SshConnectParams;
  color?: string | null;
  cwd?: string | null;
}

export type SshAuth =
  | { method: "password"; password: string }
  | { method: "key"; key_path: string; passphrase?: string | null }
  | { method: "agent" };

export interface SshConnectParams {
  session_id: number;
  host: string;
  port: number;
  username: string;
  cols: number;
  rows: number;
  auth: SshAuth;
  jump?: JumpParams | null;
}

export interface JumpParams {
  host: string;
  port: number;
  username: string;
  auth: SshAuth;
}

export interface PtyExitPayload {
  id: number;
}

export interface SshExitPayload {
  id: number;
  code: number;
}

export interface SshClosePayload {
  id: number;
}

export interface SshErrorPayload {
  id: number;
  message: string;
}

export interface HostKeyPromptPayload {
  id: number;
  fingerprint: string;
  changed: boolean;
}

export interface HostRecord {
  id?: number | null;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: string;
  keyPath?: string | null;
  password?: string | null;
  passphrase?: string | null;
  groupName: string;
  tags: string;
  jumpHost?: string | null;
  jumpPort?: number | null;
  jumpUser?: string | null;
  jumpPassword?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SshConnectedPayload {
  id: number;
}

export interface Snippet {
  id?: number | null;
  name: string;
  command: string;
  createdAt?: string | null;
}

export interface RestorableSession {
  kind: "local" | "ssh";
  title: string;
  color?: string | null;
  host?: string | null;
  port?: number | null;
  username?: string | null;
}

export interface SftpEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number | null;
  mtime: number | null;
}

export interface SftpProgress {
  opId: number;
  transferred: number;
  total: number;
}

export interface SftpDone {
  opId: number;
  ok: boolean;
  error: string | null;
}

export interface TunnelInfo {
  id: number;
  kind: string;
  listenPort: number;
  targetHost: string;
  targetPort: number;
  active: boolean;
}