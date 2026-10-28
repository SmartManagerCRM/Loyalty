import type { Services } from "../../repositories";
import type { CustomerInsight } from "../../domain/scoring";
import { pickReward, placeholderValues } from "../../domain/messaging";
import { Placeholder } from "../../domain/templates";
import type { Customer, Offer } from "../../domain/types";

export type Values = Partial<Record<Placeholder, string | number | null>>;

/** Resolve placeholder values for many customers at once. Offer lookups only happen when the template uses {offer_name}. */
export async function buildValues(svc: Services, customers: Pick<Customer, "id" | "name">[], body: string, insights: Map<string, CustomerInsight>): Promise<Map<string, Values>> {
  const business = await svc.settings.get("business");
  const rewards = body.includes("{reward_name}") ? await svc.loyalty.rewards() : [];
  const now = svc.ctx.now();
  const out = new Map<string, Values>();
  const offers: Offer[] = body.includes("{offer_name}") ? (await svc.loyalty.offers()).filter((o) => o.active && o.startsOn <= now.toISOString().slice(0, 10)) : [];
  for (const c of customers) {
    const balance = insights.get(c.id)?.pointsBalance ?? 0;
    let offer: Offer | null = null;
    if (offers.length) {
      const el = await svc.loyalty.eligibleOffers(c.id);
      offer = el[0] ?? null;
    }
    out.set(c.id, placeholderValues(c, business, balance, pickReward(balance, rewards, now), offer));
  }
  return out;
}
