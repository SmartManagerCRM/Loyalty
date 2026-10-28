"use strict";

// src/preload/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("gen", {
  call: (method, ...args) => import_electron.ipcRenderer.invoke("gen:call", method, args)
});
