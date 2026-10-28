import { openSqlJsDb } from "../database/sqljs";
import { createServices, Services } from "../repositories";
import type { SerialDb } from "../database/db";

export interface TestEnv {
  svc: Services;
  db: SerialDb;
  clock: { now: Date; advanceDays(n: number): void };
}

export async function makeEnv(start = new Date("2026-03-01T10:00:00Z"), writable: () => void = () => undefined): Promise<TestEnv> {
  const { db } = await openSqlJsDb();
  const clock = {
    now: new Date(start),
    advanceDays(n: number) {
      this.now = new Date(this.now.getTime() + n * 86_400_000);
    },
  };
  const svc = await createServices(db, { now: () => clock.now, assertWritable: writable });
  await svc.completeSetup({
    business: { name: "Test Salon", type: "salon", phone: "", logoDataUrl: null, countryCallingCode: "966" },
    locale: { language: "en", dateFormat: "DMY" },
    currency: { code: "SAR", decimals: 2 },
    earnRule: { perAmountMinor: 1000, points: 1, perVisitBonus: 0, minPurchaseMinor: 0 },
  });
  return { svc, db, clock };
}

export const daysAgo = (env: TestEnv, n: number) => new Date(env.clock.now.getTime() - n * 86_400_000).toISOString();
