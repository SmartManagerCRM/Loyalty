import React, { useState } from "react";
import { Check, Globe } from "lucide-react";
import { C } from "./theme";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français", comingSoon: true },
];

export default function LanguageSelector({ language, onChange }) {
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-black/5"
        style={{ color: C.slate }}
        title="Display language"
      >
        <Globe size={14} />
        {current.code.toUpperCase()}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl bg-white py-1 shadow-lg" style={{ border: `1px solid ${C.border}` }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                disabled={l.comingSoon}
                onClick={() => { onChange(l.code); setOpen(false); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ color: C.ink }}
              >
                <span>{l.label}{l.comingSoon && <span className="ml-1 text-[10px]" style={{ color: C.slateLight }}>(soon)</span>}</span>
                {language === l.code && <Check size={14} color={C.green} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
