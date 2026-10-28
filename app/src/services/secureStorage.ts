import { Capacitor } from "@capacitor/core";
import type { SecureKV } from "./licensing";

/** Native secure store: Android Keystore-backed / iOS Keychain (capacitor-secure-storage-plugin). */
export async function createSecureKV(): Promise<SecureKV> {
  if (Capacitor.isNativePlatform()) {
    const { SecureStoragePlugin } = await import("capacitor-secure-storage-plugin");
    return {
      kind: "keystore",
      async get(key) {
        try {
          return (await SecureStoragePlugin.get({ key })).value;
        } catch {
          return null; // plugin throws when key is missing
        }
      },
      async set(key, value) {
        await SecureStoragePlugin.set({ key, value });
      },
    };
  }
  // Browser preview only: NOT secure. Never used in the shipped apps.
  return {
    kind: "browser-storage",
    async get(key) {
      try { return localStorage.getItem(`smloyalty.${key}`); } catch { return null; }
    },
    async set(key, value) {
      try { localStorage.setItem(`smloyalty.${key}`, value); } catch { /* ignore */ }
    },
  };
}

export function createMemoryKV(): SecureKV {
  const m = new Map<string, string>();
  return { kind: "memory", get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
}
