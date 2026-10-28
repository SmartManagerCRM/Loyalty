import { Capacitor } from "@capacitor/core";

/** Save text to a file and hand it to the system share sheet (native) or download it (browser). */
export async function saveAndShare(filename: string, text: string, mime = "text/plain"): Promise<"shared" | "downloaded"> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, dialogTitle: filename, files: [uri] });
    } catch (e) {
      if (e instanceof Error && /cancel/i.test(e.message)) return "shared"; // user dismissed the sheet
      throw e;
    }
    return "shared";
  }
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "downloaded";
}

export async function shareText(text: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import("@capacitor/share");
    await Share.share({ title, text, dialogTitle: title });
  } else if (navigator.share) {
    await navigator.share({ title, text });
  } else {
    await copyText(text);
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** Open the system file picker and read the chosen file as text. Resolves null if cancelled. */
export function pickTextFile(accept = "*/*"): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    input.addEventListener("change", async () => {
      settled = true;
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      if (f.size > MAX_FILE_BYTES) return reject(new Error("file_too_large"));
      try { resolve({ name: f.name, text: await f.text() }); } catch (e) { reject(e); }
    });
    input.addEventListener("cancel", () => { if (!settled) { input.remove(); resolve(null); } });
    document.body.appendChild(input);
    input.click();
  });
}

/** Open a link in the matching external app (WhatsApp, dialer, SMS, mail). The user still sends the message themselves. */
export function openExternal(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
