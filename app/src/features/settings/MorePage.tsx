import { BarChart3, DatabaseBackup, FileText, KeyRound, ListChecks, Settings2, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useApp } from "../../app/AppContext";
import { Page } from "../../components/Page";
import { Badge, ListRow } from "../../components/ui";

export function MorePage() {
  const { t, licenseStatus, settings } = useApp();
  const items = [
    { to: "/reports", icon: BarChart3, label: t("more.reports"), sub: t("more.reportsSub") },
    { to: "/actions/followups", icon: ListChecks, label: t("followup.title"), sub: t("more.followupsSub") },
    { to: "/settings/backup", icon: DatabaseBackup, label: t("more.backup"), sub: t("more.backupSub") },
    { to: "/customers/import", icon: FileText, label: t("more.importExport"), sub: t("more.importExportSub") },
    { to: "/settings/rules", icon: SlidersHorizontal, label: t("more.rules"), sub: t("more.rulesSub") },
    { to: "/settings/templates", icon: FileText, label: t("more.templates"), sub: t("more.templatesSub") },
    { to: "/settings", icon: Settings2, label: t("more.settings"), sub: t("more.settingsSub") },
    { to: "/settings/license", icon: KeyRound, label: t("more.license"), sub: t(`license.status.${licenseStatus.kind}`) },
    { to: "/settings/privacy", icon: ShieldCheck, label: t("more.privacy"), sub: t("more.privacySub") },
  ];
  return (
    <Page title={t("nav.more")} back>
      <div className="stack">
        <p className="muted small">{settings.business.name} · v{__APP_VERSION__}</p>
        <div className="card flush list">
          {items.map((i) => <ListRow key={i.to + i.label} to={i.to} leading={<i.icon color="var(--brand-deep)" />} title={i.label} sub={i.sub} trailing={i.to === "/settings/license" && licenseStatus.kind !== "active" ? <Badge tone="warn">!</Badge> : undefined} />)}
        </div>
      </div>
    </Page>
  );
}
