import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Button, Check, ConfirmSheet, SelectField, Spinner, TextArea, TextField } from "../../components/ui";
import type { Channel, Consent, Customer } from "../../domain/types";
import type { DuplicateMatch } from "../../repositories/customers";
import { DomainError } from "../../database/db";

export function CustomerFormPage() {
  const { id } = useParams();
  const { svc, settings, t, toast, bump, fail } = useApp();
  const nav = useNavigate();
  const { data: existing, loading } = useData(async () => (id ? svc.customers.get(id) : null), [id]);
  const { data: allTags } = useData(() => svc.customers.allTags(), []);
  const [f, setF] = useState({ name: "", phone: "", email: "", birthday: "", noYear: false, notes: "", channel: "whatsapp" as Channel, consent: "unknown" as Consent, tags: "", custom: {} as Record<string, string> });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!existing) return;
    const c: Customer = existing;
    setF({ name: c.name, phone: c.phone ?? "", email: c.email ?? "", birthday: c.birthday?.startsWith("--") ? `2000-${c.birthday.slice(2)}` : c.birthday ?? "", noYear: !!c.birthday?.startsWith("--"), notes: c.notes ?? "", channel: c.preferredChannel, consent: c.consent, tags: c.tags.join(", "), custom: c.customFields });
  }, [existing]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const build = () => ({
    name: f.name, phone: f.phone || null, email: f.email || null, notes: f.notes || null, preferredChannel: f.channel, consent: f.consent,
    birthday: f.birthday ? (f.noYear ? `--${f.birthday.slice(5)}` : f.birthday) : null,
    tags: f.tags.split(/[,،;]/).map((s) => s.trim()).filter(Boolean), customFields: f.custom,
  });

  const save = async (skipDupCheck = false) => {
    setBusy(true);
    setErrors({});
    try {
      const input = build();
      if (!skipDupCheck) {
        const found = await svc.customers.findDuplicates(input, id);
        if (found.length) { setDups(found); setBusy(false); return; }
      }
      const saved = id ? await svc.customers.update(id, input) : await svc.customers.create(input);
      toast(t("customers.saved"));
      bump();
      nav(`/customers/${saved.id}`, { replace: true });
    } catch (e) {
      if (e instanceof DomainError && ["name_required", "phone_invalid", "email_invalid", "birthday_invalid"].includes(e.code)) {
        setErrors({ [e.code.split("_")[0]!]: t(`err.${e.code}`) });
      } else fail(e);
    } finally { setBusy(false); }
  };

  if (id && loading) return <Page title={t("customers.edit")} back><Spinner /></Page>;
  return (
    <Page title={id ? t("customers.edit") : t("customers.add")} back>
      <div className="stack-lg">
        <div className="stack">
          <TextField label={t("customers.name")} value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} autoFocus={!id} maxLength={120} autoComplete="off" />
          <TextField label={t("customers.phone")} hint={t("customers.phoneHint")} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} dir="ltr" maxLength={40} />
          <TextField label={t("customers.email")} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} error={errors.email} dir="ltr" maxLength={160} />
          <div className="stack" style={{ gap: 4 }}>
            <TextField label={`${t("customers.birthday")} (${t("common.optional")})`} type="date" value={f.birthday} onChange={(e) => set("birthday", e.target.value)} error={errors.birthday} />
            <Check label={t("customers.birthdayNoYear")} checked={f.noYear} onChange={(v) => set("noYear", v)} />
          </div>
          <div className="grid2">
            <SelectField label={t("customers.channel")} value={f.channel} onChange={(e) => set("channel", e.target.value as Channel)}>
              {(["whatsapp", "sms", "call", "email", "none"] as Channel[]).map((c) => <option key={c} value={c}>{t(`channel.${c}`)}</option>)}
            </SelectField>
            <SelectField label={t("customers.consent")} value={f.consent} onChange={(e) => set("consent", e.target.value as Consent)}>
              {(["granted", "unknown", "do_not_contact"] as Consent[]).map((c) => <option key={c} value={c}>{t(`consent.${c}`)}</option>)}
            </SelectField>
          </div>
          <p className="hint">{t("customers.consentHint")}</p>
          <TextField label={t("customers.tags")} hint={allTags?.length ? `${t("customers.tagsHint")} ${allTags.slice(0, 6).join(", ")}` : t("customers.tagsHint")} value={f.tags} onChange={(e) => set("tags", e.target.value)} />
          {settings.customFields.map((cf) => (
            <TextField key={cf.key} label={cf.label} value={f.custom[cf.key] ?? ""} onChange={(e) => set("custom", { ...f.custom, [cf.key]: e.target.value })} maxLength={200} />
          ))}
          <TextArea label={t("common.notes")} value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
        </div>
        <Button variant="primary" block write busy={busy} onClick={() => void save()}>{t("common.save")}</Button>
      </div>
      {dups ? (
        <ConfirmSheet title={t("customers.dupTitle")} confirmLabel={t("customers.dupSaveAnyway")} onClose={() => setDups(null)} onConfirm={() => { setDups(null); void save(true); }}>
          <p>{t("customers.dupText")}</p>
          <div className="card flush list">
            {dups.map((d) => (
              <button key={d.customer.id} type="button" className="list-row" onClick={() => nav(`/customers/${d.customer.id}`)}>
                <div className="grow"><div className="strong">{d.customer.name}</div><div className="small muted">{d.matchedOn.map((m) => t(`customers.match.${m}`)).join(" · ")}</div></div>
              </button>
            ))}
          </div>
        </ConfirmSheet>
      ) : null}
    </Page>
  );
}
