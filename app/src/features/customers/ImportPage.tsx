import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileUp, CheckCircle2 } from "lucide-react";
import { useApp } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, Banner, Button, Card, Check, SelectField } from "../../components/ui";
import { ColumnMapping, IMPORT_FIELDS, ImportField, guessMapping, ParsedCsv } from "../../domain/csv";
import type { ImportPreview } from "../../repositories/importExport";
import { pickTextFile, saveAndShare } from "../../services/files";

type Step = "choose" | "map" | "preview" | "done";

export function ImportPage() {
  const { svc, t, num, toast, fail, bump } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("choose");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [withDups, setWithDups] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const choose = async () => {
    try {
      const f = await pickTextFile(".csv,text/csv,text/plain,*/*");
      if (!f) return;
      const parsed = svc.io.parse(f.text);
      if (!parsed.headers.length || !parsed.rows.length) { toast(t("import.empty"), true); return; }
      setCsv(parsed);
      setFileName(f.name);
      setMapping(guessMapping(parsed.headers));
      setStep("map");
    } catch (e) { fail(e); }
  };
  const runPreview = async () => {
    if (!csv) return;
    setBusy(true);
    try { setPreview(await svc.io.preview(csv, mapping)); setWithDups(new Set()); setStep("preview"); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try { const r = await svc.io.commit(preview, withDups); setResult(r); bump(); setStep("done"); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const downloadReport = async () => {
    if (!preview) return;
    try { await saveAndShare("import-errors.csv", svc.io.errorReport(preview), "text/csv"); } catch (e) { fail(e); }
  };
  const templateCsv = "name,phone,email,birthday,notes,tags,points,last_visit_date,total_spent\r\nSara Ali,0501234567,sara@example.com,1990-05-04,Prefers evenings,vip;friends,50,2026-02-01,350.00\r\n";

  return (
    <Page title={t("import.title")} back>
      <div className="stack-lg">
        {step === "choose" ? (
          <>
            <Card><div className="stack">
              <p>{t("import.intro")}</p>
              <ul className="small muted" style={{ margin: 0, paddingInlineStart: 18 }}>
                <li>{t("import.rule1")}</li><li>{t("import.rule2")}</li><li>{t("import.rule3")}</li>
              </ul>
              <Button variant="primary" write block onClick={() => void choose()}><FileUp />{t("import.choose")}</Button>
              <Button block onClick={() => void saveAndShare("customers-template.csv", templateCsv, "text/csv").catch(fail)}><Download />{t("import.template")}</Button>
            </div></Card>
          </>
        ) : null}

        {step === "map" && csv ? (
          <div className="stack">
            <Banner>{t("import.mapIntro", { file: fileName, rows: num(csv.rows.length) })}</Banner>
            {IMPORT_FIELDS.map((f: ImportField) => (
              <SelectField key={f} label={`${t(`import.field.${f}`)}${f === "name" ? " *" : ""}`} value={mapping[f] ?? ""}
                onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[f]; else n[f] = Number(e.target.value); return n; })}>
                <option value="">{t("import.skip")}</option>
                {csv.headers.map((h, idx) => <option key={idx} value={idx}>{h || `#${idx + 1}`}</option>)}
              </SelectField>
            ))}
            <div className="row"><Button onClick={() => setStep("choose")}>{t("common.back")}</Button>
              <Button variant="primary" className="grow" busy={busy} disabled={mapping.name === undefined} onClick={() => void runPreview()}>{t("import.preview")}</Button></div>
          </div>
        ) : null}

        {step === "preview" && preview ? (
          <div className="stack">
            <div className="grid3">
              <div className="stat brand"><span className="v num">{num(preview.counts.ok)}</span><span className="l">{t("import.ready")}</span></div>
              <div className="stat warn"><span className="v num">{num(preview.counts.duplicate)}</span><span className="l">{t("import.duplicates")}</span></div>
              <div className="stat danger"><span className="v num">{num(preview.counts.error)}</span><span className="l">{t("import.errors")}</span></div>
            </div>
            <Banner>{t("import.safe")}</Banner>
            {preview.counts.duplicate + preview.counts.error > 0 ? <Button onClick={() => void downloadReport()}><Download />{t("import.report")}</Button> : null}
            <div className="card flush list">
              {preview.rows.slice(0, 200).map((r) => (
                <div key={r.line} className="list-row" style={{ cursor: "default", alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="strong">{r.input?.name ?? r.raw[mapping.name ?? 0] ?? "—"} <span className="muted small">#{r.line}</span></div>
                    {r.status === "error" ? <div className="small err">{r.errors.map((e) => t(`err.${e}`)).join(" · ")}</div> : null}
                    {r.status === "duplicate" ? <Check label={t("import.dupLabel", { name: r.duplicateOf ?? "" })} checked={withDups.has(r.line)} onChange={(v) => setWithDups((s) => { const n = new Set(s); if (v) n.add(r.line); else n.delete(r.line); return n; })} /> : null}
                  </div>
                  <Badge tone={r.status === "ok" ? "brand" : r.status === "duplicate" ? "warn" : "danger"}>{t(`import.status.${r.status}`)}</Badge>
                </div>
              ))}
            </div>
            {preview.rows.length > 200 ? <p className="small muted">{t("import.showing", { count: 200, total: preview.rows.length })}</p> : null}
            <div className="row"><Button onClick={() => setStep("map")}>{t("common.back")}</Button>
              <Button variant="primary" write className="grow" busy={busy} disabled={preview.counts.ok + withDups.size === 0} onClick={() => void commit()}>{t("import.commit", { count: preview.counts.ok + withDups.size })}</Button></div>
          </div>
        ) : null}

        {step === "done" && result ? (
          <Card><div className="empty"><CheckCircle2 />
            <h3>{t("import.doneTitle")}</h3><p>{t("import.doneText", { imported: result.imported, skipped: result.skipped })}</p>
            <Button variant="primary" onClick={() => nav("/customers", { replace: true })}>{t("import.viewCustomers")}</Button></div></Card>
        ) : null}
      </div>
    </Page>
  );
}
