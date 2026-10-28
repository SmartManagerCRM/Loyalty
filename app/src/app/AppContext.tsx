import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode, DependencyList } from "react";
import type { Services } from "../repositories";
import type { LicenseManager, LicenseStatus } from "../services/licensing";
import type { SettingsMap } from "../domain/settings";
import { formatInstant, formatNumber, formatYmd, TFn, translate, LANGUAGES } from "../i18n";
import { formatMoney, CurrencyConfig } from "../domain/money";
import { DomainError } from "../database/db";
import type { Reason } from "../domain/types";

export interface Toast { id: number; text: string; error?: boolean }

export interface AppValue {
  svc: Services;
  license: LicenseManager;
  licenseStatus: LicenseStatus;
  canWrite: boolean;
  settings: SettingsMap;
  reloadSettings(): Promise<void>;
  version: number;
  bump(): void;
  t: TFn;
  lang: string;
  money(minor: number): string;
  date(ymdOrIso: string, withTime?: boolean): string;
  num(n: number): string;
  reason(r: Reason): string;
  toast(text: string, error?: boolean): void;
  toasts: Toast[];
  fail(e: unknown): void;
  platform: "android" | "ios" | "web";
}

const Ctx = createContext<AppValue | null>(null);
export const useApp = (): AppValue => {
  const v = useContext(Ctx);
  if (!v) throw new Error("AppProvider missing");
  return v;
};

export function AppProvider({ svc, license, initialSettings, platform, children }: { svc: Services; license: LicenseManager; initialSettings: SettingsMap; platform: AppValue["platform"]; children: ReactNode }) {
  const [settings, setSettings] = useState(initialSettings);
  const [licenseStatus, setLicenseStatus] = useState(license.status);
  const [version, setVersion] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  useEffect(() => license.subscribe(setLicenseStatus), [license]);
  // keep the license clock fresh while the app is open or resumed
  useEffect(() => {
    const tick = () => void license.touch();
    const id = setInterval(tick, 5 * 60_000);
    const vis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [license]);

  const lang = settings.locale.language;
  useEffect(() => {
    const l = LANGUAGES.find((x) => x.code === lang) ?? LANGUAGES[0]!;
    document.documentElement.lang = l.code;
    document.documentElement.dir = l.dir;
  }, [lang]);

  const t: TFn = useCallback((key, params) => translate(lang, key, params), [lang]);
  const toast = useCallback((text: string, error = false) => {
    const id = ++toastId.current;
    setToasts((x) => [...x, { id, text, error }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), error ? 6000 : 3200);
  }, []);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const reloadSettings = useCallback(async () => {
    svc.settings.invalidate();
    setSettings(await svc.settings.all());
    bump();
  }, [svc, bump]);

  const value = useMemo<AppValue>(() => {
    const cur: CurrencyConfig = settings.currency;
    return {
      svc, license, licenseStatus, canWrite: licenseStatus.kind === "active", settings, reloadSettings, version, bump, t, lang,
      money: (m) => formatMoney(m, cur),
      date: (s, withTime) => (s.length === 10 ? formatYmd(s, settings.locale.dateFormat) : formatInstant(s, settings.locale.dateFormat, withTime)),
      num: formatNumber,
      reason: (r) => translate(lang, `reason.${r.key}`, r.params),
      toast, toasts,
      fail: (e) => {
        if (e instanceof DomainError) toast(translate(lang, `err.${e.code}`, e.params) === `err.${e.code}` ? e.message : translate(lang, `err.${e.code}`, e.params), true);
        else {
          console.error(e);
          toast(translate(lang, "err.unexpected"), true);
        }
      },
      platform,
    };
  }, [svc, license, licenseStatus, settings, reloadSettings, version, bump, t, lang, toast, toasts, platform]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Run an async loader whenever dependencies or the global data version change. */
export function useData<T>(loader: () => Promise<T>, deps: DependencyList = []): { data: T | undefined; loading: boolean; error: unknown; reload(): void } {
  const { version } = useApp();
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: unknown }>({ loading: true });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    loader().then(
      (data) => my === seq.current && setState({ data, loading: false }),
      (error) => my === seq.current && setState({ loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tick, ...deps]);
  return { data: state.data, loading: state.loading && state.data === undefined, error: state.error, reload: () => setTick((x) => x + 1) };
}
