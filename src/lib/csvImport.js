import Papa from "papaparse";
import * as XLSX from "xlsx";

// Matches header variants flexibly: "Last Visit", "last_visit", "lastvisit"
// all resolve to the same key.
function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP = {
  name: ["name", "customername", "clientname", "fullname"],
  phone: ["phone", "mobile", "whatsapp", "phonenumber"],
  email: ["email", "emailaddress"],
  lastvisit: ["lastvisit", "lastappointment", "lastsession", "lastpurchase", "date"],
  totalvisits: ["totalvisits", "visits", "numvisits", "numberofvisits"],
  totalspending: ["totalspending", "totalspend", "spending", "amount", "totalamount"],
  service: ["service", "product", "servicename"],
};

function resolveRow(rawRow) {
  const normalized = {};
  for (const [key, value] of Object.entries(rawRow)) {
    normalized[normalizeHeader(key)] = value;
  }
  const out = {};
  for (const [field, variants] of Object.entries(HEADER_MAP)) {
    const variant = variants.find((v) => normalized[v] !== undefined && normalized[v] !== "");
    if (variant) out[field] = normalized[variant];
  }
  return out;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

// Returns { customers, skipped } where each customer is shaped for a
// `customers` insert (see supabase/schema.sql import_* columns).
export function rowsToCustomers(rows) {
  const customers = [];
  let skipped = 0;
  for (const rawRow of rows) {
    const row = resolveRow(rawRow);
    if (!row.name) { skipped++; continue; }
    customers.push({
      name: String(row.name).trim(),
      phone: row.phone ? String(row.phone).trim() : null,
      email: row.email ? String(row.email).trim() : null,
      import_last_visit_date: parseDate(row.lastvisit),
      import_total_visits: parseNumber(row.totalvisits),
      import_total_spending: parseNumber(row.totalspending),
    });
  }
  return { customers, skipped };
}

// file -> raw row objects (array of {header: value}), regardless of
// CSV or Excel input.
export function parseSpreadsheetFile(file) {
  return new Promise((resolve, reject) => {
    const isExcel = /\.xlsx?$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: reject,
      });
    }
  });
}
