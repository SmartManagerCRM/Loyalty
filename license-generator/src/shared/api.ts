import type { DerivedState, HistoryFilter, IssuedRecord, IssueOptions, ReissueOptions } from "../core/types";
import type { KeyStatus } from "../core/keystore";

export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };
export type SaveResult = { saved: boolean; path?: string };

export interface RequestInfo {
  requestId: string;
  fingerprint: string;
  platform: string;
  appVersion: string;
  createdAt: string;
  customerReference?: string;
  /** an active license already exists for this device */
  existing?: { licenseId: string; customerReference: string; licenseType: string; expiresAt: string | null };
}

export interface IssueDTO {
  record: IssuedRecord;
  compactText: string;
  summary: string[];
  fileName: string;
}

export interface Summary {
  total: number;
  activeLifetime: number;
  activeCustom: number;
  expiring: number;
  expired: number;
  superseded: number;
  expiringSoon: IssuedRecord[];
}

export type HistoryRow = IssuedRecord & { state: DerivedState };

export interface ImportPreview {
  added: number;
  identical: number;
  conflicts: string[];
  token: string;
}

/** Everything the renderer may ask the main process to do. The private key never crosses this boundary. */
export interface GeneratorApi {
  info(): Promise<{ version: string; dataDir: string; platform: string }>;
  "key.status"(): Promise<KeyStatus>;
  "key.create"(passphrase: string): Promise<KeyStatus>;
  "key.unlock"(passphrase: string): Promise<KeyStatus>;
  "key.lock"(): Promise<KeyStatus>;
  "key.savePublicKeyFile"(): Promise<SaveResult>;
  "key.saveEncryptedBackup"(): Promise<SaveResult>;
  "key.restoreFromBackup"(passphrase: string): Promise<KeyStatus | null>;
  "request.openFile"(): Promise<{ name: string; text: string } | null>;
  "request.parse"(text: string): Promise<RequestInfo>;
  "license.issue"(o: IssueOptions): Promise<IssueDTO>;
  "license.renew"(o: IssueOptions & { renewsLicenseId: string }): Promise<IssueDTO>;
  "license.reissue"(o: ReissueOptions): Promise<IssueDTO>;
  "license.saveFile"(licenseId: string): Promise<SaveResult>;
  "license.get"(licenseId: string): Promise<(HistoryRow & { compactText: string; summary: string[] }) | null>;
  "history.list"(filter: HistoryFilter): Promise<HistoryRow[]>;
  "history.summary"(): Promise<Summary>;
  "history.exportBackup"(): Promise<SaveResult>;
  "history.pickImport"(): Promise<ImportPreview | null>;
  "history.commitImport"(token: string): Promise<{ added: number; identical: number; conflicts: string[] }>;
  "app.copy"(text: string): Promise<void>;
  "app.showDataFolder"(): Promise<void>;
}

export type Method = keyof GeneratorApi;
export const METHODS: Method[] = [
  "info", "key.status", "key.create", "key.unlock", "key.lock", "key.savePublicKeyFile", "key.saveEncryptedBackup", "key.restoreFromBackup",
  "request.openFile", "request.parse", "license.issue", "license.renew", "license.reissue", "license.saveFile", "license.get",
  "history.list", "history.summary", "history.exportBackup", "history.pickImport", "history.commitImport", "app.copy", "app.showDataFolder",
];
