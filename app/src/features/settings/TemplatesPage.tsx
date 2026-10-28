import { useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Button, Empty, ListRow, SelectField, Sheet, Spinner, TextArea, TextField } from "../../components/ui";
import { ACTION_TYPES, ActionType, MessageTemplate } from "../../domain/types";
import { PLACEHOLDERS, placeholdersIn, renderTemplate } from "../../domain/templates";
import { LANGUAGES } from "../../i18n";
import { DEFAULT_TEMPLATES } from "../../domain/templates";
import { uuid } from "../../domain/ids";

export function TemplatesPage() {
  const { svc, t, bump, fail, toast } = useApp();
  const [edit, setEdit] = useState<MessageTemplate | "new" | null>(null);
  const { data, loading } = useData(() => svc.actions.templates(), []);
  const restore = async () => {
    try {
      const now = new Date().toISOString();
      const existing = new Set((data ?? []).filter((x) => x.isDefault).map((x) => `${x.actionType}|${x.language}`));
      await svc.ctx.db.transaction(async (tx) => {
        for (const d of DEFAULT_TEMPLATES.filter((d) => !existing.has(`${d.type}|${d.lang}`)))
          await tx.run("INSERT INTO message_templates (id, name, action_type, language, body, is_default, active, created_at, updated_at) VALUES (?,?,?,?,?,1,1,?,?)", [uuid(), d.name, d.type, d.lang, d.body, now, now]);
      });
      bump(); toast(t("common.done"));
    } catch (e) { fail(e); }
  };
  return (
    <Page title={t("more.templates")} back actions={<Button sm variant="primary" write onClick={() => setEdit("new")}><Plus />{t("templates.add")}</Button>}>
      <div className="stack-lg">
        <p className="muted small">{t("templates.intro")}</p>
        {loading ? <Spinner /> : null}
        {data && data.length === 0 ? <Empty icon={<Plus />} title={t("templates.empty")} /> : null}
        {ACTION_TYPES.map((a) => { const list = (data ?? []).filter((x) => x.actionType === a); return list.length ? (
          <section key={a} className="stack"><h2 className="section-title">{t(`action.${a}.title`)}</h2>
            <div className="card flush list">{list.map((x) => <ListRow key={x.id} onClick={() => setEdit(x)} title={x.name} sub={x.body} trailing={<Badge>{x.language}</Badge>} />)}</div></section>
        ) : null; })}
        <Button write onClick={() => void restore()}><RotateCcw />{t("templates.restore")}</Button>
      </div>
      {edit ? <TemplateSheet tpl={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
    </Page>
  );
}

function TemplateSheet({ tpl, onClose }: { tpl: MessageTemplate | null; onClose(): void }) {
  const { svc, t, bump, fail, toast, lang } = useApp();
  const [name, setName] = useState(tpl?.name ?? "");
  const [type, setType] = useState<ActionType>(tpl?.actionType ?? "custom");
  const [language, setLanguage] = useState(tpl?.language ?? lang);
  const [body, setBody] = useState(tpl?.body ?? "");
  const unknown = placeholdersIn(body).filter((p) => !(PLACEHOLDERS as readonly string[]).includes(p));
  const sample = renderTemplate(body, { customer_name: "Sara", business_name: "Your Business", points_balance: 120, reward_name: "Free item", offer_name: "Offer" }).text;
  return (
    <Sheet title={tpl ? t("templates.edit") : t("templates.add")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write disabled={!name.trim() || !body.trim() || unknown.length > 0} onClick={async () => {
      try { await svc.actions.saveTemplate({ id: tpl?.id, name, actionType: type, language, body }); bump(); toast(t("common.saved")); onClose(); } catch (e) { fail(e); }
    }}>{t("common.save")}</Button></>}>
      <TextField label={t("templates.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <div className="grid2">
        <SelectField label={t("templates.type")} value={type} onChange={(e) => setType(e.target.value as ActionType)}>{ACTION_TYPES.map((a) => <option key={a} value={a}>{t(`action.${a}.title`)}</option>)}</SelectField>
        <SelectField label={t("settings.language")} value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</SelectField>
      </div>
      <TextArea label={t("workflow.message")} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />
      <div className="row wrap">{PLACEHOLDERS.map((p) => <button key={p} type="button" className="chip" onClick={() => setBody((b) => `${b}{${p}}`)}><span className="ltr">{`{${p}}`}</span></button>)}</div>
      {unknown.length ? <p className="err">{t("workflow.unknown", { tokens: unknown.map((u) => `{${u}}`).join(" ") })}</p> : null}
      <div><div className="small muted">{t("workflow.preview")}</div><div className="pre">{sample}</div></div>
      {tpl ? <Button variant="danger" write onClick={async () => { try { await svc.actions.deleteTemplate(tpl.id); bump(); onClose(); } catch (e) { fail(e); } }}>{t("common.delete")}</Button> : null}
    </Sheet>
  );
}
