import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { C } from "../components/theme";
import Logo from "../components/Logo";
import { Btn, TextInput, Field, LoadingScreen } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

// Reached only via the recovery link Supabase Auth emails from
// resetPasswordForEmail() (see ForgotPasswordForm in Login.jsx) —
// supabase-js parses the token in the URL on load and establishes a
// short-lived recovery session, which is what `session` below reflects.
// Mounted at the App() top level (like /pricing) so it works regardless
// of whether this user already has a business.
export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ready, session } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirmPassword) { setError(t("auth.resetPassword.mismatch")); return; }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (!ready) return <LoadingScreen />;

  return (
    <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} className="mb-3" />
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.resetPassword.title")}</h1>
        </div>

        {!session ? (
          <div className="text-center">
            <p className="text-sm" style={{ color: C.slate }}>{t("auth.resetPassword.expired")}</p>
            <Link to="/login" className="mt-4 inline-block text-sm font-semibold" style={{ color: C.green }}>
              {t("auth.forgotPassword.backToSignIn")}
            </Link>
          </div>
        ) : done ? (
          <div className="text-center">
            <p className="text-sm" style={{ color: C.slate }}>{t("auth.resetPassword.success")}</p>
            <Btn onClick={() => navigate("/")} className="mt-5 w-full justify-center">{t("auth.resetPassword.continueToApp")}</Btn>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label={t("auth.resetPassword.newPasswordLabel")}>
              <div className="relative">
                <TextInput type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2" style={{ color: C.slateLight }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field label={t("auth.resetPassword.confirmPasswordLabel")}>
              <TextInput type={showPassword ? "text" : "password"} required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>

            {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

            <Btn type="submit" disabled={busy} className="w-full justify-center">
              {busy ? t("auth.resetPassword.saving") : t("auth.resetPassword.setNewPassword")}
            </Btn>
          </form>
        )}
      </div>
    </div>
  );
}
