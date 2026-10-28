import { useEffect, useMemo, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { useApp, useData } from "../../app/AppContext";
import { Button, ConfirmSheet, Empty, Initials, ListRow, SearchBox, SelectField, Sheet, TextArea, TextField } from "../../components/ui";
import { parseMoney } from "../../domain/money";
import { addDays, localDate } from "../../domain/dates";
import type { Customer } from "../../domain/types";
import { LoyaltyService } from "../../repositories/loyalty";

export function CustomerPicker({ onPick, onClose }: { onPick(c: Customer): void; onClose(): void }) {
  const { svc, t } = useApp();
  const [q, setQ] = useState("");
  const { data } = useData(() => svc.customers.list({ search: q }), [q]);
  return (
    <Sheet title={t("picker.title")} onClose={onClose}>
      <SearchBox value={q} onChange={setQ} placeholder={t("customers.search")} />
      {data && data.length === 0 ? <p className="muted">{t("common.noResults")}</p> : null}
      <div className="card flush list">
        {(data ?? []).slice(0, 40).map((c) => (
          <ListRow key={c.id} leading={<Initials name={c.name} />} title={c.name} sub={<span className="ltr">{c.phone ?? c.code}</span>} onClick={() => onPick(c)} />
        ))}
      </div>
    </Sheet>
  );
}

export function PurchaseSheet({ customerId, onClose, onDone }: { customerId: string; onClose(): void; onDone?(): void }) {
  const { svc, settings, t, money, bump, toast, fail } = useApp();
  const dec = settings.currency.decimals;
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDate(new Date()));
  const [note, setNote] = useState("");
  const [offerId, setOfferId] = useState("");
  const [busy, setBusy] = useState(false);
  const minor = parseMoney(amount, dec);
  const { data: offers } = useData(() => svc.loyalty.eligibleOffers(customerId), [customerId]);
  const { data: preview } = useData(async () => (minor !== null ? svc.loyalty.previewPoints(customerId, minor) : null), [customerId, minor]);
  const err = amount && minor === null ? t("err.amount_invalid") : null;

  const save = async () => {
    if (minor === null) return;
    setBusy(true);
    try {
      const occurredAt = date === localDate(new Date()) ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString();
      const tx = await svc.loyalty.recordPurchase({ customerId, amountMinor: minor, occurredAt, note: note || null, offerId: offerId || null });
      toast(t("purchase.recorded", { points: tx.pointsEarned }));
      bump();
      onDone?.();
      onClose();
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Sheet title={t("purchase.title")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write busy={busy} disabled={minor === null} onClick={() => void save()}>{t("common.save")}</Button></>}>
      <TextField label={t("purchase.amount", { currency: settings.currency.code })} inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} error={err} dir="ltr" />
      {preview ? (
        <div className="banner ok" aria-live="polite">
          <div>
            <strong>{t("purchase.willEarn", { points: preview.points })}</strong>
            {preview.tier && preview.multiplierPct > 100 ? <div className="small">{t("purchase.vipBonus", { tier: preview.tier.name, pct: preview.multiplierPct })}</div> : null}
          </div>
        </div>
      ) : null}
      <TextField label={t("purchase.date")} type="date" max={localDate(new Date())} value={date} onChange={(e) => setDate(e.target.value || localDate(new Date()))} />
      {offers && offers.length > 0 ? (
        <SelectField label={t("purchase.offer")} value={offerId} onChange={(e) => setOfferId(e.target.value)}>
          <option value="">{t("common.none")}</option>
          {offers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </SelectField>
      ) : null}
      <TextField label={t("common.note")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      {minor !== null && minor > 0 ? <p className="hint">{money(minor)}</p> : null}
    </Sheet>
  );
}

export function RedeemSheet({ customerId, onClose }: { customerId: string; onClose(): void }) {
  const { svc, t, bump, toast, fail, date } = useApp();
  const { data } = useData(async () => ({ rewards: await svc.loyalty.rewards(), balance: await svc.loyalty.balance(customerId) }), [customerId]);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const reward = data?.rewards.find((r) => r.id === pick);
  if (reward) {
    return (
      <ConfirmSheet title={t("redeem.confirmTitle")} confirmLabel={t("redeem.confirm")} disabled={busy} onClose={() => setPick(null)}
        onConfirm={async () => {
          setBusy(true);
          try { await svc.loyalty.redeemReward({ customerId, rewardId: reward.id }); toast(t("redeem.done", { reward: reward.name })); bump(); onClose(); } catch (e) { fail(e); } finally { setBusy(false); }
        }}>
        <p>{t("redeem.confirmText", { reward: reward.name, points: reward.pointsCost, balance: data!.balance, after: data!.balance - reward.pointsCost })}</p>
      </ConfirmSheet>
    );
  }
  return (
    <Sheet title={t("redeem.title")} onClose={onClose}>
      <p className="muted">{t("redeem.balance", { points: data?.balance ?? 0 })}</p>
      {data && data.rewards.length === 0 ? <Empty icon={<></>} title={t("rewards.emptyTitle")} text={t("rewards.emptyText")} /> : null}
      <div className="card flush list">
        {(data?.rewards ?? []).map((r) => {
          const redeemable = LoyaltyService.isRewardRedeemable(r, now);
          const enough = (data?.balance ?? 0) >= r.pointsCost;
          return (
            <ListRow key={r.id} title={r.name} sub={redeemable ? (enough ? t("redeem.cost", { points: r.pointsCost }) : t("redeem.needMore", { points: r.pointsCost - (data?.balance ?? 0) })) : r.expiresAt && Date.parse(r.expiresAt) <= now.getTime() ? `${t("status.expired")} ${date(r.expiresAt)}` : t("status.inactive")}
              onClick={redeemable && enough ? () => setPick(r.id) : undefined} />
          );
        })}
      </div>
    </Sheet>
  );
}

export function AdjustSheet({ customerId, onClose }: { customerId: string; onClose(): void }) {
  const { svc, t, bump, toast, fail } = useApp();
  const [sign, setSign] = useState<1 | -1>(1);
  const [pts, setPts] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(pts);
  const valid = Number.isInteger(n) && n > 0 && reason.trim().length > 0;
  return (
    <Sheet title={t("adjust.title")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write busy={busy} disabled={!valid} onClick={async () => {
      setBusy(true);
      try { await svc.loyalty.adjustPoints(customerId, sign * n, reason); toast(t("adjust.done")); bump(); onClose(); } catch (e) { fail(e); } finally { setBusy(false); }
    }}>{t("common.save")}</Button></>}>
      <div className="row">
        <Button variant={sign === 1 ? "primary" : "default"} onClick={() => setSign(1)} className="grow"><Plus />{t("adjust.add")}</Button>
        <Button variant={sign === -1 ? "danger" : "default"} onClick={() => setSign(-1)} className="grow"><Minus />{t("adjust.remove")}</Button>
      </div>
      <TextField label={t("adjust.points")} inputMode="numeric" value={pts} onChange={(e) => setPts(e.target.value.replace(/\D/g, ""))} dir="ltr" autoFocus />
      <TextArea label={t("adjust.reason")} hint={t("adjust.reasonHint")} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
    </Sheet>
  );
}

export function FollowUpSheet({ customerId, smartActionId, onClose, onDone }: { customerId: string; smartActionId?: string; onClose(): void; onDone?(): void }) {
  const { svc, t, bump, toast, fail } = useApp();
  const [due, setDue] = useState(addDays(localDate(new Date()), 3));
  const [note, setNote] = useState("");
  return (
    <Sheet title={t("followup.add")} onClose={onClose} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" write onClick={async () => {
      try { await svc.actions.addFollowUp({ customerId, dueOn: due, note: note || null, smartActionId: smartActionId ?? null }); toast(t("followup.added")); bump(); onDone?.(); onClose(); } catch (e) { fail(e); }
    }}>{t("common.save")}</Button></>}>
      <div className="row wrap">
        {[1, 3, 7, 14].map((d) => <Button key={d} sm onClick={() => setDue(addDays(localDate(new Date()), d))}>{t("followup.inDays", { days: d })}</Button>)}
      </div>
      <TextField label={t("followup.dueOn")} type="date" min={localDate(new Date())} value={due} onChange={(e) => setDue(e.target.value)} />
      <TextArea label={t("common.note")} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
    </Sheet>
  );
}

export function useCustomerLookup() {
  const { svc } = useApp();
  const { data } = useData(() => svc.customers.list({ includeArchived: true }), []);
  return useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data]);
}

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
