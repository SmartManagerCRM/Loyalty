import { useEffect } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Sparkles, Gift } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useApp } from "./AppContext";
import { Banner, LinkButton, Toasts } from "../components/ui";
import { TodayPage } from "../features/dashboard/TodayPage";
import { CustomersPage } from "../features/customers/CustomersPage";
import { CustomerFormPage } from "../features/customers/CustomerForm";
import { CustomerProfilePage } from "../features/customers/CustomerProfile";
import { ImportPage } from "../features/customers/ImportPage";
import { ActionsHome } from "../features/smart-actions/ActionsHome";
import { WorkflowPage } from "../features/smart-actions/WorkflowPage";
import { RunPage } from "../features/smart-actions/RunPage";
import { FollowUpsPage } from "../features/smart-actions/FollowUpsPage";
import { SegmentEditorPage } from "../features/smart-actions/SegmentEditor";
import { LoyaltyPage } from "../features/loyalty/LoyaltyPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { MorePage } from "../features/settings/MorePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { RulesPage } from "../features/settings/RulesPage";
import { TemplatesPage } from "../features/settings/TemplatesPage";
import { BackupPage } from "../features/settings/BackupPage";
import { LicensePage } from "../features/settings/LicensePage";
import { PrivacyPage } from "../features/settings/PrivacyPage";
import { ActivationScreen } from "../features/licensing/ActivationScreen";
import { SetupWizard } from "../features/setup/SetupWizard";

function LicenseBanner() {
  const { licenseStatus: s, t, date } = useApp();
  if (s.kind === "active") return null;
  const exp = s.payload?.expiresAt;
  const tone = s.kind === "expired" ? "danger" : "warn";
  return (
    <div style={{ padding: "8px 14px 0", maxWidth: 760, margin: "0 auto" }}>
      <Banner tone={tone} action={<LinkButton to="/settings/license" sm variant="soft">{t("license.manage")}</LinkButton>}>
        <strong>{t(`licenseBanner.${s.kind}.title`)}</strong>
        <div className="small">{t(`licenseBanner.${s.kind}.text`, { date: exp ? date(exp, false) : "" })}</div>
      </Banner>
    </div>
  );
}

function Shell() {
  const { t, lang } = useApp();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    void import("@capacitor/app").then(({ App: CapApp }) =>
      CapApp.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack && !["/today"].includes(window.location.hash.replace("#", ""))) nav(-1);
        else void CapApp.exitApp();
      }).then((h) => { remove = () => void h.remove(); }),
    );
    return () => remove?.();
  }, [nav]);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const items = [
    { to: "/today", icon: Home, label: t("nav.today") },
    { to: "/customers", icon: Users, label: t("nav.customers") },
    { to: "/actions", icon: Sparkles, label: t("nav.actions") },
    { to: "/loyalty", icon: Gift, label: t("nav.loyaltyShort") },
  ];
  return (
    <div className="app" key={lang}>
      <LicenseBanner />
      <Routes>
        <Route path="/today" element={<TodayPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/new" element={<CustomerFormPage />} />
        <Route path="/customers/import" element={<ImportPage />} />
        <Route path="/customers/:id" element={<CustomerProfilePage />} />
        <Route path="/customers/:id/edit" element={<CustomerFormPage />} />
        <Route path="/actions" element={<ActionsHome />} />
        <Route path="/actions/followups" element={<FollowUpsPage />} />
        <Route path="/actions/segment/:id" element={<SegmentEditorPage />} />
        <Route path="/actions/run/:id" element={<RunPage />} />
        <Route path="/actions/:type" element={<WorkflowPage />} />
        <Route path="/loyalty" element={<LoyaltyPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/rules" element={<RulesPage />} />
        <Route path="/settings/templates" element={<TemplatesPage />} />
        <Route path="/settings/backup" element={<BackupPage />} />
        <Route path="/settings/license" element={<LicensePage />} />
        <Route path="/settings/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
      <nav className="nav" aria-label={t("nav.primary")}>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? "active" : "")}>
            <i.icon aria-hidden /> <span>{i.label}</span>
          </NavLink>
        ))}
      </nav>
      <Toasts />
    </div>
  );
}

export function App() {
  const { licenseStatus, settings } = useApp();
  const blocked = licenseStatus.kind === "unlicensed" || licenseStatus.kind === "invalid";
  if (blocked) return <><ActivationScreen /><Toasts /></>;
  if (!settings.setupComplete) {
    return licenseStatus.kind === "active" ? <><SetupWizard /><Toasts /></> : <><ActivationScreen /><Toasts /></>;
  }
  return <Shell />;
}


