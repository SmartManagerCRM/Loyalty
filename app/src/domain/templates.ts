import type { ActionType } from "./types";

export const PLACEHOLDERS = ["customer_name", "business_name", "points_balance", "reward_name", "offer_name"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export interface RenderResult {
  text: string;
  /** Placeholders present in the template for which no value was available. */
  missing: Placeholder[];
  /** Unknown {tokens} that are not supported placeholders. */
  unknown: string[];
}

export function renderTemplate(body: string, values: Partial<Record<Placeholder, string | number | null>>): RenderResult {
  const missing = new Set<Placeholder>();
  const unknown = new Set<string>();
  const text = body.replace(/\{([a-z_]+)\}/g, (whole, key: string) => {
    if (!(PLACEHOLDERS as readonly string[]).includes(key)) {
      unknown.add(key);
      return whole;
    }
    const v = values[key as Placeholder];
    if (v === undefined || v === null || String(v).trim() === "") {
      missing.add(key as Placeholder);
      return whole;
    }
    return String(v);
  });
  return { text, missing: [...missing], unknown: [...unknown] };
}

export function placeholdersIn(body: string): string[] {
  return [...new Set([...body.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!))];
}

type Lang = "en" | "ar";
export const DEFAULT_TEMPLATES: { type: ActionType; lang: Lang; name: string; body: string }[] = [
  { type: "win_back", lang: "en", name: "We miss you", body: "Hi {customer_name}, it's {business_name}. It's been a while and we'd love to see you again." },
  { type: "win_back", lang: "ar", name: "اشتقنا لك", body: "مرحباً {customer_name}، معك {business_name}. مضى وقت منذ زيارتك الأخيرة ويسعدنا رؤيتك مجدداً." },
  { type: "prevent_churn", lang: "en", name: "Friendly check-in", body: "Hi {customer_name}, this is {business_name}. Just checking in — is there anything we can do for you? We'd be glad to see you soon." },
  { type: "prevent_churn", lang: "ar", name: "تواصل ودّي", body: "مرحباً {customer_name}، معك {business_name}. أردنا الاطمئنان عليك، وهل يمكننا مساعدتك بشيء؟ يسعدنا رؤيتك قريباً." },
  { type: "retain_vip", lang: "en", name: "VIP thank you", body: "Hi {customer_name}, {business_name} here. Thank you for being one of our valued customers. We'd love to look after you on your next visit." },
  { type: "retain_vip", lang: "ar", name: "شكراً لعميلنا المميز", body: "مرحباً {customer_name}، معك {business_name}. نشكرك لأنك من عملائنا المميزين، ويسعدنا خدمتك في زيارتك القادمة." },
  { type: "new_customer", lang: "en", name: "Thanks for visiting", body: "Hi {customer_name}, thank you for visiting {business_name}! We'd love to welcome you back soon." },
  { type: "new_customer", lang: "ar", name: "شكراً لزيارتك", body: "مرحباً {customer_name}، شكراً لزيارتك {business_name}! يسعدنا استقبالك مجدداً قريباً." },
  { type: "birthday", lang: "en", name: "Birthday wishes", body: "Happy birthday {customer_name}! 🎉 Everyone at {business_name} wishes you a wonderful day." },
  { type: "birthday", lang: "ar", name: "تهنئة عيد ميلاد", body: "كل عام وأنت بخير {customer_name}! 🎉 يتمنى لك فريق {business_name} يوماً رائعاً." },
  { type: "points_reminder", lang: "en", name: "Points reminder", body: "Hi {customer_name}, you have {points_balance} points at {business_name} — enough to redeem {reward_name}. Visit us to enjoy it!" },
  { type: "points_reminder", lang: "ar", name: "تذكير بالنقاط", body: "مرحباً {customer_name}، لديك {points_balance} نقطة في {business_name}، وهي تكفي لاستبدال {reward_name}. زرنا للاستمتاع بها!" },
  { type: "custom", lang: "en", name: "General message", body: "Hi {customer_name}, this is {business_name}." },
  { type: "custom", lang: "ar", name: "رسالة عامة", body: "مرحباً {customer_name}، معك {business_name}." },
];
