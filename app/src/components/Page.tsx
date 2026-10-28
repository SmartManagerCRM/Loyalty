import { ReactNode } from "react";
import { BackButton } from "./ui";

export function Page({ title, back, actions, children, root: _root, noNav }: { title: string; back?: boolean; actions?: ReactNode; children: ReactNode; root?: boolean; noNav?: boolean }) {
  return (
    <>
      <header className="topbar">
        {back ? <BackButton /> : null}
        <h1>{title}</h1>
        {actions}
      </header>
      <main className={`content ${noNav ? "no-nav" : ""}`}>{children}</main>
    </>
  );
}
