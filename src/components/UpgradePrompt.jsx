import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, ArrowUpCircle } from "lucide-react";
import { C } from "./theme";
import { Btn } from "./ui";

// Shown instead of a page's real content when the signed-in business's
// current plan doesn't include the feature that page represents (VIP,
// Smart Offers, Memberships, …). Access is decided server-side (RLS +
// my_plan_features()) — this is purely the "go upgrade" UX, never the
// enforcement itself.
export default function UpgradePrompt({ featureName }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: C.greenTint }}>
        <Lock size={24} color={C.green} />
      </div>
      <h2 className="text-base font-bold" style={{ color: C.ink }}>{t("upgradePrompt.title", { feature: featureName })}</h2>
      <p className="max-w-sm text-sm" style={{ color: C.slateLight }}>{t("upgradePrompt.body", { feature: featureName })}</p>
      <Btn icon={ArrowUpCircle} onClick={() => navigate("/settings?tab=billing")} className="mt-2">
        {t("upgradePrompt.cta")}
      </Btn>
    </div>
  );
}
