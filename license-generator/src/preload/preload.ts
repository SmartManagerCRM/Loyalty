import { contextBridge, ipcRenderer } from "electron";

// Minimal bridge: one allow-listed call channel. No Node, no filesystem, no key material.
contextBridge.exposeInMainWorld("gen", {
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke("gen:call", method, args),
});
