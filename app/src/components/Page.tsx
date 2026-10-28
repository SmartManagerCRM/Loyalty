import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { BackButton } from "./ui";
import { useApp } from "../app/AppContext";

export function Page({ title, back, actions, children, root, noNav }: { title: string; back?: boolean; actions?: ReactNode; children: ReactNode; root?: boolean; noNav?: boolean }) {
  const { t } = useApp();
  return (
    <>
      <header className="topbar">
        {back ? <BackButton /> : null}
        <h1>{title}</h1>
        {actions}
        {root ? <Link to="/more" aria-label={t("nav.more")} className="icon-btn"><MoreHorizontal /></Link> : null}
      </header>
      <main className={`content ${noNav ? "no-nav" : ""}`}>{children}</main>
    </>
  );
}
