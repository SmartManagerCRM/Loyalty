import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Gift } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Select, Modal, Field, Pill, ConfirmDelete, EmptyState, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useBusinessTable } from "../../lib/useBusinessTable";
import { useCustomerOverview } from "../../lib/useCustomerOverview";
import { earnedPoints, pointsBalance, canRedeem, milestoneProgress } from "../../lib/rewards";
import { supabase } from "../../lib/supabaseClient";

const TYPES = [{ value: "points", label: "Points" }, { value: "visits", label: "Visits" }, { value: "spending", label: "Spending" }];

function emptyProgram() {
  return { name: "", type: "points", active: true, config: { earn_amount: 10, earn_points: 1, redeem_points: 100, redeem_value: 20 } };
}

function ProgramForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const setConfig = (k) => (e) => setForm((f) => ({ ...f, config: { ...f.config, [k]: e.target.value === "" ? "" : Number(e.target.value) } }));

  function setType(type) {
    const defaults = {
      points: { earn_amount: 10, earn_points: 1, redeem_points: 100, redeem_value: 20 },
      visits: { visits_required: 5, reward_text: "Free service" },
      spending: { spend_threshold: 1000, reward_text: "VIP reward" },
    };
    setForm((f) => ({ ...f, type, config: defaults[type] }));
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-3">
      <Field label="Program name"><TextInput required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Field>
      <Field label="Type"><Select options={TYPES} value={form.type} onChange={(e) => setType(e.target.value)} /></Field>

      {form.type === "points" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Spend to earn"><TextInput type="number" value={form.config.earn_amount ?? ""} onChange={setConfig("earn_amount")} /></Field>
          <Field label="Points earned"><TextInput type="number" value={form.config.earn_points ?? ""} onChange={setConfig("earn_points")} /></Field>
          <Field label="Points to redeem"><TextInput type="number" value={form.config.redeem_points ?? ""} onChange={setConfig("redeem_points")} /></Field>
          <Field label="Reward value"><TextInput type="number" value={form.config.redeem_value ?? ""} onChange={setConfig("redeem_value")} /></Field>
        </div>
      )}
      {form.type === "visits" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Visits required"><TextInput type="number" value={form.config.visits_required ?? ""} onChange={setConfig("visits_required")} /></Field>
          <Field label="Reward"><TextInput value={form.config.reward_text ?? ""} onChange={(e) => setForm((f) => ({ ...f, config: { ...f.config, reward_text: e.target.value } }))} /></Field>
        </div>
      )}
      {form.type === "spending" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Spending threshold"><TextInput type="number" value={form.config.spend_threshold ?? ""} onChange={setConfig("spend_threshold")} /></Field>
          <Field label="Reward"><TextInput value={form.config.reward_text ?? ""} onChange={(e) => setForm((f) => ({ ...f, config: { ...f.config, reward_text: e.target.value } }))} /></Field>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <Btn variant="secondary" type="button" onClick={onCancel}>Cancel</Btn>
        <Btn type="submit">Save</Btn>
      </div>
    </form>
  );
}

function useCustomerRewards(businessId) {
  const [byCustomer, setByCustomer] = useState({});
  const [ready, setReady] = useState(false);

  async function refetch() {
    if (!businessId) return;
    const { data } = await supabase.from("customer_rewards").select("*").eq("business_id", businessId);
    const map = {};
    for (const row of data || []) map[row.customer_id] = row;
    setByCustomer(map);
    setReady(true);
  }

  useEffect(() => { refetch(); }, [businessId]);
  return { byCustomer, ready, refetch };
}

export default function Rewards() {
  const { business } = useAuth();
  const { rows: programs, ready: programsReady, insertRow, updateRow, deleteRow } = useBusinessTable("reward_programs", business?.id);
  const { rows: customers, ready: customersReady } = useCustomerOverview(business?.id);
  const { byCustomer: rewardsByCustomer, refetch: refetchRewards } = useCustomerRewards(business?.id);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const activePointsProgram = useMemo(() => programs.find((p) => p.type === "points" && p.active), [programs]);
  const activeMilestonePrograms = useMemo(() => programs.filter((p) => p.type !== "points" && p.active), [programs]);

  async function handleRedeemPoints(customer) {
    const redeemed = rewardsByCustomer[customer.customer_id]?.redeemed_points || 0;
    const used = activePointsProgram.config.redeem_points;
    await supabase.from("customer_rewards").upsert({
      customer_id: customer.customer_id, business_id: business.id,
      redeemed_points: redeemed + used,
      lifetime_points: earnedPoints(customer.total_spending, activePointsProgram),
    });
    await supabase.from("reward_redemptions").insert({
      business_id: business.id, customer_id: customer.customer_id, program_id: activePointsProgram.id,
      points_used: used, reward_description: `${activePointsProgram.config.redeem_value} reward`,
    });
    refetchRewards();
  }

  async function handleRedeemMilestone(customer, program) {
    await supabase.from("reward_redemptions").insert({
      business_id: business.id, customer_id: customer.customer_id, program_id: program.id,
      points_used: 0, reward_description: program.config.reward_text || program.name,
    });
    refetchRewards();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: C.ink }}>Rewards</h1>
          <p className="mt-1 text-sm" style={{ color: C.slateLight }}>Points, visit, and spending reward programs.</p>
        </div>
        <Btn icon={Plus} onClick={() => setEditing(emptyProgram())}>Add program</Btn>
      </div>

      {!programsReady ? null : programs.length === 0 ? (
        <div className="mt-6"><EmptyState title="No reward programs yet" subtitle="Create a points, visits, or spending program to start rewarding loyal customers." /></div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {programs.map((p) => (
            <div key={p.id} className="rounded-2xl bg-white p-4 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: C.ink }}>{p.name}</div>
                  <div className="mt-1 text-xs" style={{ color: C.slateLight }}>
                    {p.type === "points" && `Every ${business?.currency} ${p.config.earn_amount} = ${p.config.earn_points} pt · ${p.config.redeem_points} pts = ${business?.currency} ${p.config.redeem_value}`}
                    {p.type === "visits" && `${p.config.visits_required} visits = ${p.config.reward_text}`}
                    {p.type === "spending" && `${business?.currency} ${p.config.spend_threshold} spent = ${p.config.reward_text}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Pill color={p.active ? C.green : C.slateLight} bg={p.active ? C.greenTint : C.bg}>{p.active ? "Active" : "Inactive"}</Pill>
                  <IconButton title="Edit" onClick={() => setEditing(p)}><Pencil size={15} /></IconButton>
                  <IconButton title="Delete" danger onClick={() => setDeleting(p)}><Trash2 size={15} /></IconButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-sm font-bold" style={{ color: C.ink }}>Customer Rewards</h2>
      {!customersReady ? (
        <p className="mt-2 text-xs" style={{ color: C.slateLight }}>Loading…</p>
      ) : customers.length === 0 ? (
        <p className="mt-2 text-xs" style={{ color: C.slateLight }}>No customers yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Points Balance</th>
                <th className="px-4 py-3">Redeemed</th>
                <th className="px-4 py-3">Available Rewards</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const redeemedPts = rewardsByCustomer[c.customer_id]?.redeemed_points || 0;
                const balance = activePointsProgram ? pointsBalance(c.total_spending, activePointsProgram, redeemedPts) : null;
                const canRedeemPts = activePointsProgram && canRedeem(c.total_spending, activePointsProgram, redeemedPts);
                const metMilestones = activeMilestonePrograms.filter((p) => milestoneProgress(c, p)?.met);
                return (
                  <tr key={c.customer_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: C.ink }}>{c.name}</td>
                    <td className="px-4 py-3" style={{ color: C.slate }}>{activePointsProgram ? balance : "—"}</td>
                    <td className="px-4 py-3" style={{ color: C.slate }}>{redeemedPts}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {canRedeemPts && (
                          <Btn variant="secondary" icon={Gift} onClick={() => handleRedeemPoints(c)}>
                            Redeem {activePointsProgram.config.redeem_value} {business?.currency}
                          </Btn>
                        )}
                        {metMilestones.map((p) => (
                          <Btn key={p.id} variant="secondary" icon={Gift} onClick={() => handleRedeemMilestone(c, p)}>
                            Redeem: {p.config.reward_text || p.name}
                          </Btn>
                        ))}
                        {!canRedeemPts && metMilestones.length === 0 && <span className="text-xs" style={{ color: C.slateLight }}>—</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? "Edit program" : "Add program"} onClose={() => setEditing(null)} wide>
          <ProgramForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (form) => {
              if (editing.id) await updateRow(editing.id, form);
              else await insertRow(form);
              setEditing(null);
            }}
          />
        </Modal>
      )}
      {deleting && (
        <ConfirmDelete label={deleting.name} onCancel={() => setDeleting(null)} onConfirm={async () => { await deleteRow(deleting.id); setDeleting(null); }} />
      )}
    </div>
  );
}
