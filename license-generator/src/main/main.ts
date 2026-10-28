import { app, BrowserWindow, clipboard, dialog, ipcMain, session, shell } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { GeneratorService, FileIO } from "../core/service";
import { METHODS, Result } from "../shared/api";
import { GeneratorError } from "../core/types";

let win: BrowserWindow | null = null;
const dataDir = join(app.getPath("userData"), "data");

const io: FileIO = {
  async saveText(defaultName, text, filters) {
    const r = await dialog.showSaveDialog(win!, { defaultPath: defaultName, filters });
    if (r.canceled || !r.filePath) return { saved: false };
    writeFileSync(r.filePath, text, { encoding: "utf8", mode: 0o600 });
    return { saved: true, path: r.filePath };
  },
  async openText(filters) {
    const r = await dialog.showOpenDialog(win!, { properties: ["openFile"], filters: [...filters, { name: "All files", extensions: ["*"] }] });
    const p = r.filePaths[0];
    if (r.canceled || !p) return null;
    const buf = readFileSync(p);
    if (buf.length > 5 * 1024 * 1024) throw new GeneratorError("file_too_large");
    return { name: basename(p), text: buf.toString("utf8") };
  },
  copy: (t) => clipboard.writeText(t),
  showFolder: (p) => void shell.openPath(p),
};

const service = new GeneratorService(dataDir, io, app.getVersion());

function registerIpc() {
  ipcMain.handle("gen:call", async (event, method: string, args: unknown[]): Promise<Result<unknown>> => {
    // only our own window may call, and only allow-listed methods
    if (event.sender !== win?.webContents) return { ok: false, code: "forbidden", message: "forbidden" };
    if (!(METHODS as string[]).includes(method) || !Array.isArray(args)) return { ok: false, code: "bad_call", message: "bad call" };
    try {
      const fn = (service as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]!;
      return { ok: true, data: await fn.apply(service, args) };
    } catch (e) {
      if (e instanceof GeneratorError) return { ok: false, code: e.code, message: e.message };
      console.error(e);
      return { ok: false, code: "unexpected", message: e instanceof Error ? e.message : String(e) };
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1120, height: 780, minWidth: 900, minHeight: 640, title: "SmartManager Loyalty License Generator", backgroundColor: "#f4f7f6",
    webPreferences: { preload: join(__dirname, "../preload/preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  void win.loadFile(join(__dirname, "../renderer/index.html"));
  win.on("closed", () => { win = null; service.keys.lock(); });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(() => {
    // This tool is fully offline by design: refuse every network request.
    session.defaultSession.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*", "ftp://*/*"] }, (_d, cb) => cb({ cancel: true }));
    registerIpc();
    createWindow();
    app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
  });
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on("window-all-closed", () => { service.keys.lock(); app.quit(); });
}
