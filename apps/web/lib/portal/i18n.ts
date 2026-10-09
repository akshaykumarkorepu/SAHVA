/**
 * Patient-facing copy, in both languages.
 *
 * The staff dashboard is English — staff chose this software. Patients did not,
 * and most of them read Telugu more comfortably than English, so every string
 * a patient sees exists in both. The portal opens in the language the clinic
 * recorded for that patient and can be switched with one tap.
 */
export type Lang = "te" | "en";

/**
 * The contract both languages must satisfy.
 *
 * Typing STRINGS as Record<Lang, Strings> means a key added to English but
 * forgotten in Telugu fails the build, rather than silently showing English to
 * a Telugu-speaking patient.
 */
export type Strings = {
  yourAppointment: string;
  upcoming: string;
  noUpcoming: string;
  noUpcomingBody: string;
  pastVisits: string;
  noPast: string;
  with: string;
  at: string;
  confirm: string;
  confirmed: string;
  confirming: string;
  reschedule: string;
  cancel: string;
  cancelling: string;
  callClinic: string;
  directions: string;
  pickNewTime: string;
  noSlots: string;
  checking: string;
  keep: string;
  confirmCancelTitle: string;
  confirmCancelBody: string;
  yesCancel: string;
  changeTo: string;
  saving: string;
  linkExpired: string;
  linkExpiredBody: string;
  status: Record<
    "booked" | "confirmed" | "checked_in" | "completed" | "cancelled" | "no_show" | "needs_reschedule",
    string
  >;
  needsRescheduleNote: string;
  fee: string;
  language: string;
  seeFullRecord: string;
  seeFullRecordBody: string;
  createAccount: string;
  creating: string;
  alreadyHaveAccount: string;
  signIn: string;
  emailLabel: string;
  passwordLabel: string;
  passwordHint: string;
  accountCreated: string;
  accountCreatedBody: string;
};

export const STRINGS: Record<Lang, Strings> = {
  en: {
    yourAppointment: "Your appointment",
    upcoming: "Upcoming",
    noUpcoming: "No upcoming appointment",
    noUpcomingBody: "Call the clinic to book a new one.",
    pastVisits: "Past visits",
    noPast: "No past visits yet.",
    with: "with",
    at: "at",
    confirm: "Confirm I'll be there",
    confirmed: "Confirmed — see you then",
    confirming: "Confirming…",
    reschedule: "Change time",
    cancel: "Cancel appointment",
    cancelling: "Cancelling…",
    callClinic: "Call clinic",
    directions: "Directions",
    pickNewTime: "Pick a new time",
    noSlots: "No free times that day. Try another date.",
    checking: "Checking free times…",
    keep: "Keep it",
    confirmCancelTitle: "Cancel this appointment?",
    confirmCancelBody: "The clinic will be told. You can book again by calling them.",
    yesCancel: "Yes, cancel it",
    changeTo: "Move to this time",
    saving: "Saving…",
    linkExpired: "This link has expired",
    linkExpiredBody: "Please call the clinic and ask for a new link.",
    status: {
      booked: "Booked",
      confirmed: "Confirmed",
      checked_in: "Checked in",
      completed: "Completed",
      cancelled: "Cancelled",
      no_show: "Missed",
      needs_reschedule: "Needs a new time",
    },
    needsRescheduleNote:
      "The doctor is unavailable at this time. The clinic will contact you, or you can pick a new time now.",
    fee: "Consultation fee",
    language: "తెలుగు",
    seeFullRecord: "See your full health record",
    seeFullRecordBody:
      "Set a password to see your diagnoses, medicines and vaccinations — not just this appointment.",
    createAccount: "Create account",
    creating: "Creating…",
    alreadyHaveAccount: "Already have an account?",
    signIn: "Sign in",
    emailLabel: "Email",
    passwordLabel: "Choose a password",
    passwordHint: "At least 10 characters. A short phrase is easier to remember than a jumble.",
    accountCreated: "Account created",
    accountCreatedBody: "You can now sign in any time to see your full health record.",
  },
  te: {
    yourAppointment: "మీ అపాయింట్‌మెంట్",
    upcoming: "రాబోయేవి",
    noUpcoming: "రాబోయే అపాయింట్‌మెంట్ లేదు",
    noUpcomingBody: "కొత్తది బుక్ చేయడానికి క్లినిక్‌కి కాల్ చేయండి.",
    pastVisits: "గత సందర్శనలు",
    noPast: "ఇంకా గత సందర్శనలు లేవు.",
    with: "వద్ద",
    at: "వద్ద",
    confirm: "నేను వస్తాను అని నిర్ధారించండి",
    confirmed: "నిర్ధారించబడింది — అప్పుడు కలుద్దాం",
    confirming: "నిర్ధారిస్తోంది…",
    reschedule: "సమయం మార్చండి",
    cancel: "అపాయింట్‌మెంట్ రద్దు చేయండి",
    cancelling: "రద్దు చేస్తోంది…",
    callClinic: "క్లినిక్‌కి కాల్ చేయండి",
    directions: "దారి చూపించు",
    pickNewTime: "కొత్త సమయం ఎంచుకోండి",
    noSlots: "ఆ రోజు ఖాళీ లేదు. వేరే తేదీ చూడండి.",
    checking: "ఖాళీ సమయాలు చూస్తోంది…",
    keep: "అలాగే ఉంచండి",
    confirmCancelTitle: "ఈ అపాయింట్‌మెంట్ రద్దు చేయాలా?",
    confirmCancelBody: "క్లినిక్‌కి తెలియజేయబడుతుంది. మళ్లీ బుక్ చేయడానికి వారికి కాల్ చేయండి.",
    yesCancel: "అవును, రద్దు చేయండి",
    changeTo: "ఈ సమయానికి మార్చండి",
    saving: "సేవ్ చేస్తోంది…",
    linkExpired: "ఈ లింక్ గడువు ముగిసింది",
    linkExpiredBody: "దయచేసి క్లినిక్‌కి కాల్ చేసి కొత్త లింక్ అడగండి.",
    status: {
      booked: "బుక్ చేయబడింది",
      confirmed: "నిర్ధారించబడింది",
      checked_in: "చెక్ ఇన్ అయింది",
      completed: "పూర్తయింది",
      cancelled: "రద్దు చేయబడింది",
      no_show: "రాలేదు",
      needs_reschedule: "కొత్త సమయం కావాలి",
    },
    needsRescheduleNote:
      "ఈ సమయంలో డాక్టర్ అందుబాటులో లేరు. క్లినిక్ మిమ్మల్ని సంప్రదిస్తుంది, లేదా ఇప్పుడే కొత్త సమయం ఎంచుకోండి.",
    fee: "సంప్రదింపు ఫీజు",
    language: "English",
    seeFullRecord: "మీ పూర్తి ఆరోగ్య రికార్డు చూడండి",
    seeFullRecordBody:
      "పాస్‌వర్డ్ సెట్ చేస్తే మీ నిర్ధారణలు, మందులు మరియు టీకాలు కూడా చూడవచ్చు — ఈ అపాయింట్‌మెంట్ మాత్రమే కాదు.",
    createAccount: "ఖాతా సృష్టించండి",
    creating: "సృష్టిస్తోంది…",
    alreadyHaveAccount: "ఇప్పటికే ఖాతా ఉందా?",
    signIn: "సైన్ ఇన్",
    emailLabel: "ఈమెయిల్",
    passwordLabel: "పాస్‌వర్డ్ ఎంచుకోండి",
    passwordHint: "కనీసం 10 అక్షరాలు. గుర్తుంచుకోవడానికి ఒక చిన్న వాక్యం సులభం.",
    accountCreated: "ఖాతా సృష్టించబడింది",
    accountCreatedBody: "ఇప్పుడు మీరు ఎప్పుడైనా సైన్ ఇన్ చేసి మీ పూర్తి ఆరోగ్య రికార్డు చూడవచ్చు.",
  },
};

/** Clinic-local date formatting in the patient's own language. */
export function patientDateTime(iso: string, tz: string, lang: Lang): string {
  return new Date(iso).toLocaleString(lang === "te" ? "te-IN" : "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

export function patientTime(iso: string, tz: string, lang: Lang): string {
  return new Date(iso).toLocaleTimeString(lang === "te" ? "te-IN" : "en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

export function patientDate(iso: string, tz: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === "te" ? "te-IN" : "en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
}
