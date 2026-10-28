import type { GeneratorApi, Method, Result } from "../shared/api";

declare global {
  interface Window {
    gen: { call(method: string, ...args: unknown[]): Promise<Result<unknown>> };
  }
}

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

type Fn<M extends Method> = GeneratorApi[M] extends (...a: infer A) => Promise<infer R> ? (...a: A) => Promise<R> : never;

function call<M extends Method>(method: M): Fn<M> {
  return (async (...args: unknown[]) => {
    const res = await window.gen.call(method, ...args);
    if (!res.ok) throw new ApiError(res.code, res.message);
    return res.data;
  }) as Fn<M>;
}

export const api = {
  info: call("info"),
  keyStatus: call("key.status"), keyCreate: call("key.create"), keyUnlock: call("key.unlock"), keyLock: call("key.lock"),
  keySavePublic: call("key.savePublicKeyFile"), keySaveBackup: call("key.saveEncryptedBackup"), keyRestore: call("key.restoreFromBackup"),
  requestOpen: call("request.openFile"), requestParse: call("request.parse"),
  issue: call("license.issue"), renew: call("license.renew"), reissue: call("license.reissue"), saveLicense: call("license.saveFile"), getLicense: call("license.get"),
  list: call("history.list"), summary: call("history.summary"), exportHistory: call("history.exportBackup"), pickImport: call("history.pickImport"), commitImport: call("history.commitImport"),
  copy: call("app.copy"), showDataFolder: call("app.showDataFolder"),
};

const MESSAGES: Record<string, string> = {
  request_invalid: "That does not look like a valid SmartManager Loyalty activation request. Ask the customer to export it again.",
  key_exists: "A signing key already exists. It cannot be replaced from here, because a different key would not be accepted by existing installs.",
  no_key: "There is no signing key yet. Create one on the Signing key page first.",
  locked: "The signing key is locked. Enter your passphrase to continue.",
  wrong_passphrase: "Wrong passphrase, or the key file was modified.",
  passphrase_short: "Use a passphrase of at least 12 characters.",
  passphrase_weak: "That passphrase is too repetitive. Use a longer, more varied phrase.",
  key_file_invalid: "This is not a valid encrypted signing key file.",
  device_already_licensed: "This device already has an active license. Use Renew from the license details instead of issuing a second one.",
  duration_required: "Choose how long the license should last.",
  expiry_in_past: "The expiry date must be in the future.",
  expiry_before_start: "The expiry must be after the start date.",
  lifetime_has_no_expiry: "A lifetime license cannot have an expiry date.",
  reference_required: "Enter the customer or business name.",
  features_invalid: "Feature names may only contain lowercase letters, digits and underscores.",
  date_invalid: "That date is not valid.",
  confirmation_required: "Please confirm that you want to replace the device.",
  reason_required: "Enter a reason (at least 5 characters).",
  same_device_use_renew: "The new request is from the same device. Use Renew instead.",
  device_differs: "Renewals must be for the same device. Use Reissue for a new device.",
  not_found: "Record not found.",
  backup_invalid: "This is not a valid license history backup.",
  backup_checksum: "The backup is damaged or was edited (checksum mismatch).",
  self_check_failed: "The generated license failed its own verification. Nothing was issued.",
  file_too_large: "That file is too large.",
};
export const describeError = (e: unknown) => (e instanceof ApiError ? MESSAGES[e.code] ?? e.message : e instanceof Error ? e.message : String(e));
