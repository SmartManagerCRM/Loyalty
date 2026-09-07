import React from "react";
import { Mail } from "lucide-react";
import { C } from "../../components/theme";
import { Btn, Pill } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";

const PLAN_LABEL = { trial: "Trial", starter: "Starter", growth: "Growth", professional: "Professional", enterprise: "Enterprise" };
const STATUS_COLOR = { trialing: C.amber, active: C.green, past_due: C.red, canceled: C.slateLight };

function daysLeft(dateStr) {
  if (!dateStr) return null;
  return Math.max(0, Math.ceil((new Date(dateStr) - Date.now()) / 86400000));
}

export default function Billing() {
  const { business, role } = useAuth();
  const canManage = role === "owner" || role === "admin";
  const trialDays = daysLeft(business?.trial_ends_at);

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-bold" style={{ color: C.ink }}>Billing</h1>
      <p className="mt-1 text-sm" style={{ color: C.slateLight }}>Your plan and subscription status.</p>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold" style={{ color: C.slateLight }}>Current plan</div>
            <div className="mt-1 text-lg font-bold" style={{ color: C.ink }}>{PLAN_LABEL[business?.subscription_plan] || "Trial"}</div>
          </div>
          <Pill color={STATUS_COLOR[business?.subscription_status]} bg={`${STATUS_COLOR[business?.subscription_status]}1a`}>
            {business?.subscription_status === "trialing" ? "Trial" : business?.subscription_status}
          </Pill>
        </div>

        {business?.subscription_status === "trialing" && (
          <div className="mt-4 rounded-xl p-3 text-xs" style={{ backgroundColor: C.bg, color: C.slate }}>
            {trialDays > 0 ? `${trialDays} day${trialDays === 1 ? "" : "s"} left in your trial.` : "Your trial has ended."} No payment method is required yet — nothing will be charged automatically.
          </div>
        )}

        <div className="mt-5 border-t pt-4 text-xs" style={{ borderColor: C.border, color: C.slateLight }}>
          Payment processing isn't connected yet — this page tracks your plan, not real charges.
          {canManage ? " When you're ready to go live, reach out and we'll set up billing." : " Ask an Owner or Admin to manage billing."}
        </div>

        {canManage && (
          <a href="mailto:sales@smartmanager.app?subject=Upgrade%20my%20SmartManager%20Loyalty%20plan">
            <Btn variant="secondary" icon={Mail} className="mt-4 w-full justify-center">Contact us about upgrading</Btn>
          </a>
        )}
      </div>
    </div>
  );
}
