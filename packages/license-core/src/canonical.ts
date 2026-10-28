/**
 * Canonical JSON used for everything that is signed or checksummed.
 * Rules: object keys sorted by UTF-16 code unit order, no whitespace, strings
 * encoded by JSON.stringify, only integers allowed as numbers (no floats, NaN,
 * Infinity), no undefined. Dates must be passed as ISO strings.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new Error("canonical JSON allows safe integers only");
      return String(value);
    case "object": {
      if (Array.isArray(value)) return "[" + value.map((v) => canonicalize(v)).join(",") + "]";
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        if (obj[k] === undefined) throw new Error(`canonical JSON: undefined at "${k}"`);
        parts.push(JSON.stringify(k) + ":" + canonicalize(obj[k]));
      }
      return "{" + parts.join(",") + "}";
    }
    default:
      throw new Error(`canonical JSON: unsupported type ${typeof value}`);
  }
}
