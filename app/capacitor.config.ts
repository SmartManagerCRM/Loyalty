import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smartmanager.loyalty",
  appName: "SmartManager Loyalty",
  webDir: "dist",
  server: { androidScheme: "https", iosScheme: "capacitor", cleartext: false },
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  plugins: {
    CapacitorSQLite: { androidIsEncryption: false, iosIsEncryption: false },
  },
};

export default config;
