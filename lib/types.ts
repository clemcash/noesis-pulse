export type Period = "24h" | "7d" | "30d";
export type FeatureKey = "chat" | "debates" | "challenges" | "documents";
export type ByFeature = Record<FeatureKey, number>;
export type GroqApiCheck = { ok: boolean; latencyMs: number | null; error?: string };
export type GroqModelProbe = {
  ok: boolean; latencyMs: number | null;
  remainingRequests: number | null; limitRequests: number | null;
  remainingTokens: number | null; limitTokens: number | null;
  error?: string; probedAt: string;
};
export type GroqStatus = { api: GroqApiCheck; models: Record<string, GroqModelProbe | null> };
export type SupabaseUsage = {
  apiRequests24h: number | null; dbBytes: number; dbLimitBytes: number;
  storageBytes: number; storageLimitBytes: number;
};
export type Snapshot = {
  id?: number; taken_at: string; online: number | null; ai_requests_5m: number | null;
  by_feature: ByFeature | null; groq: GroqStatus | null; supabase: SupabaseUsage | null;
  errors: Record<string, string> | null;
};
export type RuleKey = "groq_down" | "groq_slow" | "groq_quota" | "supabase_db" | "supabase_storage" | "activity_drop" | "collector_stale";
export type AlertRule = { key: RuleKey; enabled: boolean; threshold: number; params: Record<string, number> };
export type Alert = { id: number; rule_key: RuleKey; opened_at: string; resolved_at: string | null; message: string };
export const MODELS = { primary: "openai/gpt-oss-120b", fallback: "openai/gpt-oss-20b" } as const;
export const PROBE_INTERVAL_MIN: Record<string, number> = { [MODELS.primary]: 30, [MODELS.fallback]: 60 };
