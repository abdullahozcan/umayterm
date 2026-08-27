export type SessionKind = "local" | "ssh";

export interface SessionBase {
  id: number;
  title: string;
  color?: string | null;
}

export interface LocalSession extends SessionBase {
  kind: "local";
  cwd?: string | null;
}

export interface SshSession extends SessionBase {
  kind: "ssh";
  params: SshConnectParams;
}

export type Session = LocalSession | SshSession;

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

export type AuthMethod = "password" | "key" | "agent";

export interface HostRecord {
  id: number | null;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
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
  id: number | null;
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

export type TunnelKind = "local" | "socks5" | "remote";

export interface TunnelInfo {
  id: number;
  kind: TunnelKind;
  listenPort: number;
  targetHost: string;
  targetPort: number;
  active: boolean;
}

export interface FsStat {
  mount: string;
  size: number;
  used: number;
  pct: number;
}

export interface SshStats {
  ok: boolean;
  error?: string | null;
  cpu?: number | null;
  load: number[];
  memUsed?: number | null;
  memTotal?: number | null;
  fs: FsStat[];
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiModelInfo {
  id: string;
  name?: string | null;
}

export type AiEvent =
  | { type: "chunk"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };