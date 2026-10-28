import type { Channel, Customer, Offer, Reward } from "./types";
import type { Placeholder } from "./templates";

export function pickReward(balance: number, rewards: Reward[], now: Date): Reward | null {
  const live = rewards.filter((r) => r.active && !r.archivedAt && (!r.expiresAt || Date.parse(r.expiresAt) > now.getTime()));
  const affordable = live.filter((r) => r.pointsCost <= balance).sort((a, b) => b.pointsCost - a.pointsCost);
  return affordable[0] ?? null;
}

export function placeholderValues(c: Pick<Customer, "name">, business: { name: string }, balance: number, reward: Reward | null, offer: Offer | null): Partial<Record<Placeholder, string | number | null>> {
  return {
    customer_name: c.name.trim().split(/\s+/)[0] ?? c.name,
    business_name: business.name,
    points_balance: balance,
    reward_name: reward?.name ?? null,
    offer_name: offer?.name ?? null,
  };
}

export interface ChannelLink {
  channel: Channel;
  url: string;
}

/** Build a link that opens a compatible app with the message pre-filled. The user still sends it manually. */
export function buildChannelLink(channel: Channel, customer: Pick<Customer, "phoneNorm" | "email">, text: string, subject = ""): ChannelLink | null {
  switch (channel) {
    case "whatsapp":
      return customer.phoneNorm ? { channel, url: `https://wa.me/${customer.phoneNorm}?text=${encodeURIComponent(text)}` } : null;
    case "sms":
      return customer.phoneNorm ? { channel, url: `sms:+${customer.phoneNorm}?body=${encodeURIComponent(text)}` } : null;
    case "call":
      return customer.phoneNorm ? { channel, url: `tel:+${customer.phoneNorm}` } : null;
    case "email":
      return customer.email ? { channel, url: `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` } : null;
    default:
      return null;
  }
}
