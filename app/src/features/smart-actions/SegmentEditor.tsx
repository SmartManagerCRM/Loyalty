import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp, useData } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Banner, Button, Check, Spinner, TextField } from "../../components/ui";
import type { Band, SegmentRules } from "../../domain/types";
import { matchesSegment } from "../../domain/scoring";
import { minorToDecimalString, parseMoney } from "../../domain/money";

const BANDS: Band[] = ["new", "active", "at_risk", "inactive", "no_purchases"];

export function SegmentEditorPage() {
  const { id = "new" } = useParams();
  const { svc, settings, t, num, bump, toast, fail } = useApp();
  const nav = useNavigate();
  const isNew = id === "new";
  const [name, setName] = useState("");
  const [bands, setBands] = useState<Band[]>([]);
  const [minDays, setMinDays] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [minVisits, setMinVisits] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [minPoints, setMinPoints] = useState("");
  const [tags, setTags] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [month, setMonth] = useState("");
  const { data: seg, loading } = useData(async () => (isNew ? null : svc.actions.segment(id)), [id]);
  const { data: insights } = useData(() => svc.insights.loadAll(), []);
  const dec = settings.currency.decimals;

  useEffect(() => {
    if (!seg) return;
    setName(seg.name);
    const r = seg.rules;
    setBands(r.bands ?? []); setMinDays(r.minDaysSinceLast?.toString() ?? ""); setMaxDays(r.maxDaysSinceLast?.toString() ?? "");
    setMinVisits(r.minVisits?.toString() ?? ""); setMinSpend(r.minSpendMinor !== undefined ? minorToDecimalString(r.minSpendMinor, dec) : "");
    setMinPoints(r.minPoints?.toString() ?? ""); setTags((r.tags ?? []).join(", ")); setVipOnly(!!r.tierIds?.length); setMonth(r.birthdayMonth?.toString() ?? "");
  }, [seg, dec]);

  const int = (s: string) => (s.trim() === "" ? undefined : Number.isInteger(Number(s)) && Number(s) >= 0 ? Number(s) : undefined);
  const rules: SegmentRules = {
    ...(bands.length ? { bands } : {}), ...(int(minDays) !== undefined ? { minDaysSinceLast: int(minDays) } : {}), ...(int(maxDays) !== undefined ? { maxDaysSinceLast: int(maxDays) } : {}),
    ...(int(minVisits) !== undefined ? { minVisits: int(minVisits) } : {}), ...(minSpend.trim() && parseMoney(minSpend, dec) !== null ? { minSpendMinor: parseMoney(minSpend, dec)! } : {}),
    ...(int(minPoints) !== undefined ? { minPoints: int(minPoints) } : {}), ...(tags.trim() ? { tags: tags.split(/[,،;]/).map((x) => x.trim()).filter(Boolean) } : {}),
    ...(month ? { birthdayMonth: Number(month) } : {}),
  };
  const matches = (insights ?? []).filter((i) => matchesSegment(i, rules) && (!vipOnly || i.isVip)).length;
  const empty = Object.keys(rules).length === 0 && !vipOnly;

  const save = async () => {
    try {
      const tiers = vipOnly ? (await svc.loyalty.tiers()).map((x) => x.id) : undefined;
      const sid = await svc.actions.saveSegment({ id: isNew ? undefined : id, name, rules: { ...rules, ...(tiers ? { tierIds: tiers } : {}) } });
      toast(t("common.saved")); bump(); nav(`/actions/custom?segment=${sid}`, { replace: true });
    } catch (e) { fail(e); }
  };
  if (!isNew && loading) return <Page title="" back><Spinner /></Page>;
  return (
    <Page title={isNew ? t("segment.new") : t("segment.edit")} back>
      <div className="stack-lg">
        <TextField label={t("segment.name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <div className="field"><span className="label">{t("segment.bands")}</span>
          <div className="row wrap">{BANDS.map((b) => <button key={b} type="button" className={`chip ${bands.includes(b) ? "on" : ""}`} aria-pressed={bands.includes(b)} onClick={() => setBands((x) => x.includes(b) ? x.filter((y) => y !== b) : [...x, b])}>{t(`band.${b}`)}</button>)}</div>
        </div>
        <div className="grid2">
          <TextField label={t("segment.minDays")} inputMode="numeric" value={minDays} onChange={(e) => setMinDays(e.target.value)} dir="ltr" />
          <TextField label={t("segment.maxDays")} inputMode="numeric" value={maxDays} onChange={(e) => setMaxDays(e.target.value)} dir="ltr" />
          <TextField label={t("segment.minVisits")} inputMode="numeric" value={minVisits} onChange={(e) => setMinVisits(e.target.value)} dir="ltr" />
          <TextField label={t("segment.minPoints")} inputMode="numeric" value={minPoints} onChange={(e) => setMinPoints(e.target.value)} dir="ltr" />
        </div>
        <TextField label={t("segment.minSpend", { currency: settings.currency.code })} inputMode="decimal" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} dir="ltr" />
        <TextField label={t("segment.tags")} hint={t("customers.tagsHint")} value={tags} onChange={(e) => setTags(e.target.value)} />
        <Check label={t("segment.vipOnly")} checked={vipOnly} onChange={setVipOnly} />
        <div className="field"><label htmlFor="bm">{t("segment.birthdayMonth")}</label>
          <select id="bm" className="input" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">—</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></div>
        <Banner tone={empty ? "warn" : "ok"}>{empty ? t("segment.emptyRules") : t("segment.matches", { count: num(matches) })}</Banner>
        <div className="row">
          {!isNew ? <Button variant="danger" write onClick={async () => { try { await svc.actions.archiveSegment(id); bump(); nav("/actions", { replace: true }); } catch (e) { fail(e); } }}>{t("common.delete")}</Button> : null}
          <Button variant="primary" write className="grow" disabled={!name.trim() || empty} onClick={() => void save()}>{t("common.save")}</Button>
        </div>
      </div>
    </Page>
  );
}
