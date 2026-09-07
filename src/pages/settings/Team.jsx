import React, { useEffect, useState } from "react";
import { Plus, Trash2, Mail } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, TextInput, Select, Modal, Field, Pill, ConfirmDelete, IconButton } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";

const ROLES = ["owner", "admin", "manager", "staff"];
const ROLE_LABEL = { owner: "Owner", admin: "Admin", manager: "Manager", staff: "Staff" };

function InviteModal({ businessId, onClose, onInvited }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("invite_member", { p_business_id: businessId, p_email: email.trim(), p_role: role });
    setBusy(false);
    if (error) { setError(error.message); return; }
    onInvited();
    onClose();
  }

  return (
    <Modal title="Invite teammate" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Email"><TextInput type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role"><Select options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={role} onChange={(e) => setRole(e.target.value)} /></Field>
        <p className="text-xs" style={{ color: C.slateLight }}>If they don't have an account yet, they'll join automatically as soon as they sign up with this email.</p>
        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Btn variant="secondary" type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={busy}>{busy ? "Inviting…" : "Send invite"}</Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function Team() {
  const { business, role: myRole, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [ready, setReady] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [removing, setRemoving] = useState(null);

  const canManage = myRole === "owner" || myRole === "admin";

  async function refetch() {
    if (!business?.id) return;
    const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
      supabase.rpc("list_business_members", { p_business_id: business.id }),
      supabase.from("business_invites").select("*").eq("business_id", business.id),
    ]);
    setMembers(memberRows || []);
    setInvites(inviteRows || []);
    setReady(true);
  }

  useEffect(() => { refetch(); }, [business?.id]);

  async function changeRole(userId, newRole) {
    await supabase.from("business_users").update({ role: newRole }).eq("business_id", business.id).eq("user_id", userId);
    refetch();
  }

  async function removeMember(userId) {
    await supabase.from("business_users").delete().eq("business_id", business.id).eq("user_id", userId);
    refetch();
  }

  async function cancelInvite(id) {
    await supabase.from("business_invites").delete().eq("id", id);
    refetch();
  }

  if (!ready) return <div className="p-8 text-sm" style={{ color: C.slateLight }}>Loading…</div>;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: C.slateLight }}>Who has access to {business?.name}.</p>
        {canManage && <Btn icon={Plus} onClick={() => setShowInvite(true)}>Invite teammate</Btn>}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold" style={{ color: C.slateLight, borderBottom: `1px solid ${C.border}` }}>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="px-4 py-3 font-semibold" style={{ color: C.ink }}>{m.email} {m.user_id === user?.id && <span style={{ color: C.slateLight, fontWeight: 400 }}>(you)</span>}</td>
                <td className="px-4 py-3">
                  {canManage ? (
                    <Select options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} className="w-32" />
                  ) : (
                    <Pill>{ROLE_LABEL[m.role]}</Pill>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {canManage && m.user_id !== user?.id && (
                    <IconButton title="Remove" danger onClick={() => setRemoving(m)}><Trash2 size={15} /></IconButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {invites.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-bold" style={{ color: C.ink }}>Pending invites</h2>
          <div className="mt-3 space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2 text-sm" style={{ color: C.ink }}>
                  <Mail size={14} style={{ color: C.slateLight }} /> {inv.email}
                  <Pill>{ROLE_LABEL[inv.role]}</Pill>
                </div>
                {canManage && <IconButton title="Cancel invite" danger onClick={() => cancelInvite(inv.id)}><Trash2 size={15} /></IconButton>}
              </div>
            ))}
          </div>
        </>
      )}

      {showInvite && <InviteModal businessId={business.id} onClose={() => setShowInvite(false)} onInvited={refetch} />}
      {removing && (
        <ConfirmDelete label={`${removing.email} from the team`} onCancel={() => setRemoving(null)} onConfirm={() => { removeMember(removing.user_id); setRemoving(null); }} />
      )}
    </div>
  );
}
