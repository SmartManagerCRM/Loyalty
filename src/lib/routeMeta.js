import { matchPath } from "react-router-dom";

// Single source of truth for "what does the header show for this page" —
// replaces every page rendering its own <h1>/subtitle inline, which is
// what made the app feel like a stack of separate pages instead of one
// product. Order matters: matchPath checks these in order, so put more
// specific patterns (e.g. a detail route) before their parent list route
// only if there's ever overlap — there isn't yet, but keep it in mind.
const ROUTES = [
  { path: "/", title: "Dashboard", subtitle: "Where are we losing customers, and what should we do today?" },
  { path: "/customers", title: "Customers", subtitle: "Your full customer database." },
  { path: "/customers/:id", title: "Customer Profile", subtitle: "History, segment, and next best action." },
  { path: "/recovery", title: "Recovery", subtitle: "Leads who inquired but never converted." },
  { path: "/reactivation", title: "Reactivation", subtitle: "Customers who stopped returning, by how overdue they are." },
  { path: "/retention", title: "Retention", subtitle: "Reach customers before they become inactive." },
  { path: "/rewards", title: "Rewards", subtitle: "Points, visit, and spending reward programs." },
  { path: "/vip", title: "VIP", subtitle: "Recognize top customers with priority, not discounts." },
  { path: "/offers", title: "Smart Offers", subtitle: "Offers matched to customer behavior." },
  { path: "/analytics", title: "Analytics", subtitle: "The business value this platform is generating." },
  { path: "/settings/segmentation", title: "Segmentation Rules", subtitle: "The thresholds that decide who's Active, Due, At Risk, and more." },
  { path: "/settings/team", title: "Team", subtitle: "Who has access to this business." },
  { path: "/settings/business", title: "Business Settings", subtitle: "What your customers and staff see across the app." },
  { path: "/settings/billing", title: "Billing", subtitle: "Your plan and subscription status." },
];

const DEFAULT_META = { title: "SmartManager Loyalty", subtitle: "" };

export function getPageMeta(pathname) {
  for (const route of ROUTES) {
    if (matchPath({ path: route.path, end: true }, pathname)) return route;
  }
  return DEFAULT_META;
}
