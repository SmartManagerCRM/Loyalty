import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { C } from "../components/theme";
import Logo from "../components/Logo";
import { Btn, TextInput, Field } from "../components/ui";
import { supabase } from "../lib/supabaseClient";

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    navigate("/");
  }

  return (
    <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} className="mb-3" />
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("common.appName")}</h1>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.login.tagline")}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Field label={t("auth.login.emailLabel")}>
            <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
          </Field>
          <Field label={t("auth.login.passwordLabel")}>
            <div className="relative">
              <TextInput type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

          <Btn type="submit" disabled={busy} className="w-full justify-center">
            {busy ? t("auth.login.signingIn") : t("auth.login.signIn")}
          </Btn>
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: C.slateLight }}>
          {t("auth.login.newHere")} <Link to="/signup" className="font-semibold" style={{ color: C.green }}>{t("auth.login.createBusinessAccount")}</Link>
        </p>
      </form>
    </div>
  );
}
