import { matchPath } from "react-router-dom";

// Single source of truth for "what does the header show for this page" —
// replaces every page rendering its own <h1>/subtitle inline, which is
// what made the app feel like a stack of separate pages instead of one
// product. Order matters: matchPath checks these in order, so put more
// specific patterns (e.g. a detail route) before their parent list route
// only if there's ever overlap — there isn't yet, but keep it in mind.
//
// Returns i18n keys (under the "pageMeta" namespace), not translated text —
// Header.jsx resolves them via t() so the title/subtitle react to language
// changes without this module needing to know about i18next.
const ROUTES = [
  { path: "/", key: "dashboard" },
  { path: "/customers", key: "customers" },
  { path: "/customers/:id", key: "customerProfile" },
  { path: "/bookings", key: "bookings" },
  { path: "/memberships", key: "memberships" },
  { path: "/recovery", key: "recovery" },
  { path: "/reactivation", key: "reactivation" },
  { path: "/retention", key: "retention" },
  { path: "/rewards", key: "rewards" },
  { path: "/vip", key: "vip" },
  { path: "/offers", key: "offers" },
  { path: "/analytics", key: "analytics" },
  { path: "/settings", key: "settings" },
];

export function getPageMetaKey(pathname) {
  for (const route of ROUTES) {
    if (matchPath({ path: route.path, end: true }, pathname)) return route.key;
  }
  return "default";
}
