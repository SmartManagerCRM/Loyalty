import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sliders, UsersRound, Package, Contact, Ticket, Building2, CreditCard } from "lucide-react";
import { C } from "../../components/theme";
import SegmentationSettings from "./SegmentationSettings";
import Team from "./Team";
import ServicesSettings from "./ServicesSettings";
import StaffSettings from "./StaffSettings";
import MembershipPlansSettings from "./MembershipPlansSettings";
import BusinessSettings from "./BusinessSettings";
import Billing from "./Billing";

const TABS = [
  { key: "segmentation", labelKey: "nav.segmentationRules", icon: Sliders, Component: SegmentationSettings },
  { key: "team", labelKey: "nav.team", icon: UsersRound, Component: Team },
  { key: "services", labelKey: "nav.services", icon: Package, Component: ServicesSettings },
  { key: "staff", labelKey: "nav.staff", icon: Contact, Component: StaffSettings },
  { key: "membershipPlans", labelKey: "nav.membershipPlans", icon: Ticket, Component: MembershipPlansSettings },
  { key: "business", labelKey: "nav.business", icon: Building2, Component: BusinessSettings },
  { key: "billing", labelKey: "nav.billing", icon: CreditCard, Component: Billing },
];
const TAB_KEYS = new Set(TABS.map((t) => t.key));

// One page, four tabs — replaces the four separate /settings/* routes
// this used to be. Deep-linkable via ?tab=, so old bookmarks still land
// on the right section (see the redirects in App.jsx).
export default function Settings() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : "segmentation");

  function selectTab(key) {
    setTab(key);
    setSearchParams({ tab: key }, { replace: true });
  }

  const Active = TABS.find((tb) => tb.key === tab)?.Component || SegmentationSettings;

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b px-5 pt-5 md:px-8" style={{ borderColor: C.border }}>
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => selectTab(tb.key)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-3 text-sm font-semibold transition-colors"
            style={{ borderColor: tab === tb.key ? C.green : "transparent", color: tab === tb.key ? C.green : C.slateLight }}
          >
            <tb.icon size={15} />
            {t(tb.labelKey)}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}
