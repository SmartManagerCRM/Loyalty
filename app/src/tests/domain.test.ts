import { describe, expect, it } from "vitest";
import { formatMoney, minorToDecimalString, parseMoney } from "../domain/money";
import { computeEarnedPoints, validateEarnRule } from "../domain/earn";
import { addDays, dayDiff, daysUntilBirthday, localDate } from "../domain/dates";
import { normalizePhone, sanitizeText } from "../domain/phone";
import { renderTemplate } from "../domain/templates";
import { csvCell, guessMapping, parseCsv, parseLooseDate, toCsv } from "../domain/csv";
import { computeInsight, CustomerFacts, evaluateEligibility } from "../domain/scoring";
import { DEFAULT_SETTINGS } from "../domain/settings";
import { buildChannelLink } from "../domain/messaging";

describe("money", () => {
  it("parses decimals without floating point error", () => {
    expect(parseMoney("19.99", 2)).toBe(1999);
    expect(parseMoney("0.1", 2)).toBe(10);
    expect(parseMoney("1,250.50", 2)).toBe(125050);
    expect(parseMoney("١٢٫٥٠", 2)).toBe(1250);
    expect(parseMoney("5", 3)).toBe(5000);
    expect(parseMoney("1.234", 2)).toBeNull();
    expect(parseMoney("abc", 2)).toBeNull();
    expect(parseMoney("-5", 2)).toBeNull();
  });
  it("formats and round-trips", () => {
    expect(formatMoney(125050, { code: "SAR", decimals: 2 })).toBe("1,250.50 SAR");
    expect(formatMoney(5, { code: "KWD", decimals: 3 })).toBe("0.005 KWD");
    expect(minorToDecimalString(1999, 2)).toBe("19.99");
    expect(minorToDecimalString(-1005, 2)).toBe("-10.05");
  });
});

describe("earn rule", () => {
  const rule = { perAmountMinor: 1000, points: 1, perVisitBonus: 0, minPurchaseMinor: 0 };
  it("floors on whole spend units", () => {
    expect(computeEarnedPoints(9999, rule)).toBe(9);
    expect(computeEarnedPoints(1000, rule)).toBe(1);
    expect(computeEarnedPoints(999, rule)).toBe(0);
  });
  it("applies visit bonus, minimum and multiplier", () => {
    expect(computeEarnedPoints(2000, { ...rule, perVisitBonus: 2 })).toBe(4);
    expect(computeEarnedPoints(500, { ...rule, minPurchaseMinor: 1000, perVisitBonus: 5 })).toBe(0);
    expect(computeEarnedPoints(5000, rule, 150)).toBe(7);
  });
  it("validates", () => {
    expect(validateEarnRule({ ...rule, perAmountMinor: 0 })).toBe("rule_earns_nothing");
    expect(validateEarnRule(rule)).toBeNull();
  });
});

describe("dates", () => {
  it("is DST-safe for day differences", () => {
    expect(dayDiff("2026-03-28", "2026-03-30")).toBe(2);
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });
  it("handles birthdays incl. year rollover and Feb 29", () => {
    expect(daysUntilBirthday("1990-03-05", "2026-03-01")).toBe(4);
    expect(daysUntilBirthday("--01-02", "2026-12-30")).toBe(3);
    expect(daysUntilBirthday("1992-02-29", "2026-02-27")).toBe(2);
    expect(daysUntilBirthday(null, "2026-03-01")).toBeNull();
  });
  it("local date follows the device timezone", () => {
    const iso = "2026-03-01T23:30:00Z";
    const before = process.env.TZ;
    process.env.TZ = "Asia/Riyadh"; // UTC+3
    expect(localDate(iso)).toBe("2026-03-02");
    process.env.TZ = "America/Los_Angeles";
    expect(localDate(iso)).toBe("2026-03-01");
    process.env.TZ = before;
  });
});

describe("text and phone", () => {
  it("normalizes phones", () => {
    expect(normalizePhone("+966 50 123 4567")).toBe("966501234567");
    expect(normalizePhone("0501234567", "966")).toBe("966501234567");
    expect(normalizePhone("00966501234567")).toBe("966501234567");
    expect(normalizePhone("٠٥٠١٢٣٤٥٦٧", "966")).toBe("966501234567");
    expect(normalizePhone("12")).toBeNull();
  });
  it("sanitizes control and bidi characters", () => {
    expect(sanitizeText("  Ali\u0000‮  ")).toBe("Ali");
    expect(sanitizeText("a\nb")).toBe("a\nb");
  });
});

describe("templates", () => {
  it("fills placeholders and reports missing / unknown", () => {
    const r = renderTemplate("Hi {customer_name}, {points_balance} pts, {reward_name} {foo}", { customer_name: "Sara", points_balance: 120, reward_name: null });
    expect(r.text).toBe("Hi Sara, 120 pts, {reward_name} {foo}");
    expect(r.missing).toEqual(["reward_name"]);
    expect(r.unknown).toEqual(["foo"]);
  });
  it("builds channel links without claiming delivery", () => {
    const l = buildChannelLink("whatsapp", { phoneNorm: "966501234567", email: null }, "Hi & bye");
    expect(l?.url).toBe("https://wa.me/966501234567?text=Hi%20%26%20bye");
    expect(buildChannelLink("whatsapp", { phoneNorm: null, email: null }, "x")).toBeNull();
    expect(buildChannelLink("none", { phoneNorm: "1", email: null }, "x")).toBeNull();
  });
});

describe("csv", () => {
  it("parses quoted fields, BOM and guesses mapping (EN + AR headers)", () => {
    const p = parseCsv('﻿Name,Phone,الإيميل\r\n"Ali, Jr",0501,a@b.co\r\n\r\n');
    expect(p.headers).toEqual(["Name", "Phone", "الإيميل"]);
    expect(p.rows).toEqual([["Ali, Jr", "0501", "a@b.co"]]);
    expect(guessMapping(["الاسم", "رقم الجوال", "Email"])).toEqual({ name: 0, phone: 1, email: 2 });
  });
  it("neutralizes formula injection but keeps numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(toCsv(["a"], [["x,y"]])).toContain('"x,y"');
  });
  it("parses ambiguous dates using the preference", () => {
    expect(parseLooseDate("03/04/2026", "DMY")).toBe("2026-04-03");
    expect(parseLooseDate("03/04/2026", "MDY")).toBe("2026-03-04");
    expect(parseLooseDate("25/12/2026", "MDY")).toBe("2026-12-25");
    expect(parseLooseDate("2026-02-30")).toBeNull();
  });
});

describe("scoring", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  const cfg = DEFAULT_SETTINGS.scoring;
  const facts = (over: Partial<CustomerFacts> & { visitsDaysAgo?: number[] }): CustomerFacts => ({
    id: "c1", name: "Test", createdAt: "2025-01-01T00:00:00Z", birthday: null, consent: "granted", hasPhone: true, tags: [],
    purchaseAts: (over.visitsDaysAgo ?? []).map((d) => new Date(now.getTime() - d * 86_400_000).toISOString()),
    spendMinor: 10000, pointsBalance: 0, tierId: null, tierName: null, lastContactAt: null, nextFollowUpOn: null, affordableRewards: [], returnIntervalDays: null, ...over,
  });

  it("learns the usual interval and flags lapsing customers with an explanation", () => {
    // visits every ~20 days, last seen 45 days ago
    const i = computeInsight(facts({ visitsDaysAgo: [125, 105, 85, 65, 45] }), cfg, now);
    expect(i.usualIntervalDays).toBe(20);
    expect(i.band).toBe("at_risk");
    const c = evaluateEligibility("prevent_churn", i, cfg)!;
    expect(c.reasons[0]).toEqual({ key: "noPurchaseUsual", params: { days: 45, interval: 20 } });
    expect(evaluateEligibility("win_back", i, cfg)).toBeNull();
  });
  it("uses the default interval when history is short and says so", () => {
    const i = computeInsight(facts({ visitsDaysAgo: [200, 100] }), cfg, now);
    expect(i.intervalFromHistory).toBe(false);
    expect(i.band).toBe("inactive");
    expect(evaluateEligibility("win_back", i, cfg)!.reasons[0]!.key).toBe("noPurchaseDefault");
  });
  it("detects declining frequency among still-active customers", () => {
    const i = computeInsight(facts({ visitsDaysAgo: [10, 100, 110, 120, 130, 140] }), cfg, now);
    expect(i.recent90).toBe(1);
    expect(i.prior90).toBe(5);
    expect(i.frequencyDeclined).toBe(true);
  });
  it("keeps VIPs out of prevent_churn and puts slipping VIPs in retain_vip", () => {
    const i = computeInsight(facts({ visitsDaysAgo: [125, 105, 85, 65, 45], tierId: "t", tierName: "VIP" }), cfg, now);
    expect(evaluateEligibility("prevent_churn", i, cfg)).toBeNull();
    const c = evaluateEligibility("retain_vip", i, cfg)!;
    expect(c.reasons.some((r) => r.key === "vipTier")).toBe(true);
  });
  it("marks Do Not Contact customers as blocked and respects cooldown", () => {
    const i = computeInsight(facts({ visitsDaysAgo: [300], consent: "do_not_contact", lastContactAt: new Date(now.getTime() - 3 * 86_400_000).toISOString() }), cfg, now);
    const c = evaluateEligibility("win_back", i, cfg)!;
    expect(c.blocked).toBe("do_not_contact");
    expect(c.recentlyContacted).toBe(true);
  });
  it("finds new customers who have not returned, birthdays and reward reminders", () => {
    const n = computeInsight(facts({ visitsDaysAgo: [12], createdAt: "2026-05-10T00:00:00Z" }), cfg, now);
    expect(n.band).toBe("new");
    expect(evaluateEligibility("new_customer", n, cfg)!.reasons[0]).toEqual({ key: "newNoReturn", params: { days: 12 } });
    const b = computeInsight(facts({ visitsDaysAgo: [10, 30], birthday: "1990-06-03" }), cfg, now);
    expect(evaluateEligibility("birthday", b, cfg)!.reasons[0]).toEqual({ key: "birthdaySoon", params: { days: 2 } });
    const r = computeInsight(facts({ visitsDaysAgo: [10, 30], pointsBalance: 150, affordableRewards: [{ id: "r", name: "Free coffee", cost: 100 }] }), cfg, now);
    expect(evaluateEligibility("points_reminder", r, cfg)).not.toBeNull();
  });
  it("uses a per-customer return period instead of history, without the minimum-day floors", () => {
    const i = computeInsight(facts({ visitsDaysAgo: [12, 40, 80], returnIntervalDays: 7 }), cfg, now);
    expect(i.intervalCustom).toBe(true);
    expect(i.effectiveIntervalDays).toBe(7);
    expect(i.atRiskAfterDays).toBe(11);
    expect(i.band).toBe("at_risk");
    expect(evaluateEligibility("prevent_churn", i, cfg)!.reasons[0]).toEqual({ key: "noPurchaseCustom", params: { days: 12, interval: 7 } });
    const auto = computeInsight(facts({ visitsDaysAgo: [12, 40, 80] }), cfg, now);
    expect(auto.intervalCustom).toBe(false);
    expect(auto.band).toBe("active");
    const slow = computeInsight(facts({ visitsDaysAgo: [60], returnIntervalDays: 90 }), cfg, now);
    expect(slow.band).toBe("active");
  });
  it("never labels anyone 'lost' - bands are at_risk/inactive", () => {
    const i = computeInsight(facts({ visitsDaysAgo: [900] }), cfg, now);
    expect(["inactive"]).toContain(i.band);
  });
});
