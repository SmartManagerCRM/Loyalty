// Deliberately NOT the WhatsApp Business API. This just opens a normal
// wa.me chat with a pre-filled message — the employee reviews/edits and
// sends it themselves from their own WhatsApp. See README "WhatsApp".
export function openWhatsApp(phone, message) {
  const digits = (phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (!digits) return;
  const url = `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
