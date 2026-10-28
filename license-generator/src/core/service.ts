import { randomUUID } from "node:crypto";
import { licenseToCompact, parseActivationRequest } from "@smloyalty/license-core";
import { KeyStore } from "./keystore";
import { HistoryStore } from "./history";
import { Issuer } from "./issuer";
import { GeneratorError, HistoryFilter, IssuedRecord, IssueOptions, ReissueOptions } from "./types";
import type { GeneratorApi, ImportPreview, IssueDTO, RequestInfo } from "../shared/api";

export interface FileIO {
  /** returns false when the user cancelled */
  saveText(defaultName: string, text: string, filters: { name: string; extensions: string[] }[]): Promise<{ saved: boolean; path?: string }>;
  openText(filters: { name: string; extensions: string[] }[]): Promise<{ name: string; text: string } | null>;
  copy(text: string): void;
  showFolder(path: string): void;
}

const toDTO = (r: { record: IssuedRecord; compactText: string; summary: string[]; fileName: string }): IssueDTO => ({ record: r.record, compactText: r.compactText, summary: r.summary, fileName: r.fileName });

/** Application service used by the Electron main process (and by tests). Contains no Electron imports. */
export class GeneratorService implements Omit<GeneratorApi, never> {
  private pendingImport = new Map<string, string>();
  readonly keys: KeyStore;
  readonly history: HistoryStore;
  private readonly issuer: Issuer;
  constructor(private readonly dir: string, private readonly io: FileIO, private readonly version = "1.0.0", now: () => number = Date.now) {
    this.keys = new KeyStore(dir);
    this.history = new HistoryStore(dir);
    this.issuer = new Issuer(this.keys, this.history, now);
  }

  async info() { return { version: this.version, dataDir: this.dir, platform: process.platform }; }
  async "key.status"() { return this.keys.status(); }
  async "key.create"(p: string) { return this.keys.create(p); }
  async "key.unlock"(p: string) { return this.keys.unlock(p); }
  async "key.lock"() { this.keys.lock(); return this.keys.status(); }
  async "key.savePublicKeyFile"() { return this.io.saveText("trusted-keys.json", this.keys.publicKeyFileText(), [{ name: "JSON", extensions: ["json"] }]); }
  async "key.saveEncryptedBackup"() { return this.io.saveText(`smloyalty-signing-key-backup-${this.keys.status().keyId}.smlkey`, this.keys.encryptedBackupText(), [{ name: "Encrypted signing key", extensions: ["smlkey"] }]); }
  async "key.restoreFromBackup"(passphrase: string) {
    const f = await this.io.openText([{ name: "Encrypted signing key", extensions: ["smlkey"] }]);
    return f ? this.keys.restoreFromBackup(f.text, passphrase) : null;
  }
  async "request.openFile"() { return this.io.openText([{ name: "Activation request", extensions: ["smloyaltyrequest", "json", "txt"] }]); }
  async "request.parse"(text: string): Promise<RequestInfo> {
    const r = parseActivationRequest(text);
    if (!r.ok) throw new GeneratorError("request_invalid", r.message);
    const ex = this.history.activeForDevice(r.request.deviceBinding.value);
    return {
      requestId: r.request.requestId, fingerprint: r.request.deviceBinding.value, platform: r.request.platform, appVersion: r.request.appVersion, createdAt: r.request.createdAt,
      customerReference: r.request.customerReference,
      existing: ex ? { licenseId: ex.licenseId, customerReference: ex.customerReference, licenseType: ex.licenseType, expiresAt: ex.expiresAt } : undefined,
    };
  }
  async "license.issue"(o: IssueOptions) { return toDTO(this.issuer.issue(o)); }
  async "license.renew"(o: IssueOptions & { renewsLicenseId: string }) { return toDTO(this.issuer.renew(o)); }
  async "license.reissue"(o: ReissueOptions) { return toDTO(this.issuer.reissue(o)); }
  async "license.saveFile"(id: string) {
    const r = this.history.get(id);
    if (!r) throw new GeneratorError("not_found");
    return this.io.saveText(r.fileName, r.fileText, [{ name: "SmartManager Loyalty license", extensions: ["smloyaltylicense"] }]);
  }
  async "license.get"(id: string) {
    const r = this.history.list({}, Date.now()).find((x) => x.licenseId === id);
    if (!r) return null;
    return { ...r, compactText: licenseToCompact(JSON.parse(r.fileText)), summary: Issuer.summary(r) };
  }
  async "history.list"(f: HistoryFilter) { return this.history.list(f); }
  async "history.summary"() { return this.history.summary(); }
  async "history.exportBackup"() {
    return this.io.saveText(`license-history-backup-${new Date().toISOString().slice(0, 10)}.smlhistory`, this.history.exportBackupText(), [{ name: "License history backup", extensions: ["smlhistory"] }]);
  }
  async "history.pickImport"(): Promise<ImportPreview | null> {
    const f = await this.io.openText([{ name: "License history backup", extensions: ["smlhistory", "json"] }]);
    if (!f) return null;
    const p = this.history.previewImport(f.text);
    const token = randomUUID();
    this.pendingImport.set(token, f.text);
    return { added: p.added.length, identical: p.identical, conflicts: p.conflicts, token };
  }
  async "history.commitImport"(token: string) {
    const text = this.pendingImport.get(token);
    if (!text) throw new GeneratorError("not_found");
    this.pendingImport.delete(token);
    return this.history.importBackup(text);
  }
  async "app.copy"(text: string) { this.io.copy(text); }
  async "app.showDataFolder"() { this.io.showFolder(this.dir); }
}
