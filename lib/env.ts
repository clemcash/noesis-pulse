function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const env = {
  get noesisRef() { return required("NOESIS_PROJECT_REF"); },
  get managementToken() { return required("SUPABASE_MANAGEMENT_TOKEN"); },
  get groqKey() { return required("GROQ_API_KEY"); },
  get pulseUrl() { return required("NEXT_PUBLIC_PULSE_SUPABASE_URL"); },
  get pulseAnonKey() { return required("NEXT_PUBLIC_PULSE_SUPABASE_ANON_KEY"); },
  get pulseServiceKey() { return required("PULSE_SUPABASE_SERVICE_ROLE_KEY"); },
  get allowedEmail() { return required("ALLOWED_EMAIL"); },
  get cronSecret() { return required("CRON_SECRET"); },
  get telegramToken() { return required("TELEGRAM_BOT_TOKEN"); },
  get telegramChatId() { return required("TELEGRAM_CHAT_ID"); },
};

/** Données fictives : uniquement en local, jamais en production. */
export function isDemo(): boolean {
  return process.env.PULSE_DEMO === "1" && process.env.NODE_ENV !== "production";
}

const MB = 1024 * 1024;

export function limits(): { dbLimitBytes: number; storageLimitBytes: number } {
  return {
    dbLimitBytes: Number(process.env.NOESIS_DB_LIMIT_MB || 500) * MB,
    storageLimitBytes: Number(process.env.NOESIS_STORAGE_LIMIT_MB || 1024) * MB,
  };
}
