// Personalized WhatsApp message drafts. Human-editable by design — this
// only produces a starting point (see README "Message Generation").

const TEMPLATES = {
  en: {
    REACTIVATE: ({ customerName, businessName, days, offer }) =>
      `Hi ${customerName} 🌷, it's ${businessName}. We noticed it's been a while (${days} days) since your last visit and wanted to check in.${offer ? ` As a welcome back, we'd like to offer you ${offer}.` : ""} Would you like to book again soon?`,
    "CONTACT CUSTOMER": ({ customerName, businessName }) =>
      `Hi ${customerName}, this is ${businessName}. You're usually due for a visit around now — would you like to book your next appointment?`,
    "VIP CARE": ({ customerName, businessName }) =>
      `Hi ${customerName}, this is ${businessName}. Just wanted to personally thank you for being one of our valued customers — let us know if there's anything we can do for you.`,
    "ENCOURAGE SECOND VISIT": ({ customerName, businessName, offer }) =>
      `Hi ${customerName}, thanks for visiting ${businessName}!${offer ? ` Here's ${offer} on your next visit.` : ""} We'd love to see you again soon.`,
  },
  ar: {
    REACTIVATE: ({ customerName, businessName, days, offer }) =>
      `السلام عليكم ${customerName} 🌷، معك ${businessName}. لاحظنا إنه مر ${days} يوم من آخر زيارة لك وحبينا نطمّن عليك.${offer ? ` كهدية رجوعك، نقدملك ${offer}.` : ""} تحب نحجزلك موعد قريب؟`,
    "CONTACT CUSTOMER": ({ customerName, businessName }) =>
      `مرحباً ${customerName}، معك ${businessName}. موعدك المعتاد قرّب، تحب نحجزلك زيارتك الجاية؟`,
    "VIP CARE": ({ customerName, businessName }) =>
      `مرحباً ${customerName}، معك ${businessName}. حبينا نشكرك شخصياً على كونك من عملائنا المميزين — أخبرنا إذا نقدر نساعدك بأي شي.`,
    "ENCOURAGE SECOND VISIT": ({ customerName, businessName, offer }) =>
      `مرحباً ${customerName}، شكراً لزيارتك ${businessName}!${offer ? ` إليك ${offer} في زيارتك القادمة.` : ""} نتطلع لرؤيتك مرة أخرى قريباً.`,
  },
};

export function generateMessage({ action, customerName, businessName, days, offer, language = "en" }) {
  const lang = TEMPLATES[language] ? language : "en";
  const builder = TEMPLATES[lang][action] || TEMPLATES[lang]["CONTACT CUSTOMER"];
  return builder({ customerName, businessName, days, offer });
}

const RECOVERY_TEMPLATES = {
  en: ({ leadName, businessName, interestedService }) =>
    `Hi ${leadName}, this is ${businessName}. Just following up on your interest in ${interestedService || "our services"} — happy to answer any questions or help you book. Would you like to go ahead?`,
  ar: ({ leadName, businessName, interestedService }) =>
    `مرحباً ${leadName}، معك ${businessName}. أتابع معك بخصوص اهتمامك بـ${interestedService || "خدماتنا"} — يسعدني أجاوب على أي استفسار أو أساعدك تحجز. تحب نكمل؟`,
};

export function generateRecoveryMessage({ leadName, businessName, interestedService, language = "en" }) {
  const lang = RECOVERY_TEMPLATES[language] ? language : "en";
  return RECOVERY_TEMPLATES[lang]({ leadName, businessName, interestedService });
}

const MEMBERSHIP_TEMPLATES = {
  en: {
    EXPIRING_SOON: ({ customerName, businessName, planName, sessionsRemaining }) =>
      `Hi ${customerName}, this is ${businessName}. Your ${planName} membership is expiring soon${sessionsRemaining != null ? ` with ${sessionsRemaining} session(s) still left` : ""} — want to book before it runs out, or renew?`,
    UNUSED_SESSIONS: ({ customerName, businessName, planName, sessionsRemaining }) =>
      `Hi ${customerName}, this is ${businessName}. You still have ${sessionsRemaining != null ? `${sessionsRemaining} session(s)` : "sessions"} left on your ${planName} membership that haven't been used yet — would you like to book one in?`,
  },
  ar: {
    EXPIRING_SOON: ({ customerName, businessName, planName, sessionsRemaining }) =>
      `مرحباً ${customerName}، معك ${businessName}. عضويتك "${planName}" على وشك الانتهاء${sessionsRemaining != null ? ` ولا يزال لديك ${sessionsRemaining} جلسة` : ""} — تحب تحجز قبل انتهائها أو تجدد؟`,
    UNUSED_SESSIONS: ({ customerName, businessName, planName, sessionsRemaining }) =>
      `مرحباً ${customerName}، معك ${businessName}. لا يزال لديك ${sessionsRemaining != null ? `${sessionsRemaining} جلسة` : "جلسات"} لم تُستخدم بعد من عضوية "${planName}" — تحب نحجزلك موعد؟`,
  },
};

export function generateMembershipMessage({ action, customerName, businessName, planName, sessionsRemaining, language = "en" }) {
  const lang = MEMBERSHIP_TEMPLATES[language] ? language : "en";
  const builder = MEMBERSHIP_TEMPLATES[lang][action] || MEMBERSHIP_TEMPLATES[lang].EXPIRING_SOON;
  return builder({ customerName, businessName, planName, sessionsRemaining });
}
