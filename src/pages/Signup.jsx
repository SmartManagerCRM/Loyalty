import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { C } from "../components/theme";
import Logo from "../components/Logo";
import { Btn, TextInput, Field } from "../components/ui";
import { supabase } from "../lib/supabaseClient";

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (data.session) navigate("/");
    else setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.signup.checkEmailTitle")}</h1>
          <p className="mt-2 text-sm" style={{ color: C.slate }}>
            {t("auth.signup.checkEmailPrefix")} <strong>{email}</strong>{t("auth.signup.checkEmailMiddle")}{" "}
            <Link to="/login" className="font-semibold" style={{ color: C.green }}>{t("auth.signup.checkEmailLink")}</Link> {t("auth.signup.checkEmailSuffix")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={56} className="mb-3" />
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>{t("auth.signup.title")}</h1>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>{t("auth.signup.subtitle")}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Field label={t("auth.login.emailLabel")}>
            <TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com" />
          </Field>
          <Field label={t("auth.login.passwordLabel")}>
            <TextInput type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </Field>

          {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

          <Btn type="submit" disabled={busy} className="w-full justify-center">
            {busy ? t("auth.signup.creatingAccount") : t("auth.signup.createAccount")}
          </Btn>
        </div>

        <p className="mt-5 text-center text-xs" style={{ color: C.slateLight }}>
          {t("auth.signup.alreadyHaveAccount")} <Link to="/login" className="font-semibold" style={{ color: C.green }}>{t("auth.signup.signIn")}</Link>
        </p>
      </form>
    </div>
  );
}
