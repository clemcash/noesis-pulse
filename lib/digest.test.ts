import { describe, expect, it } from "vitest";
import { buildDigest } from "./digest";

const base = {
  day: new Date("2026-09-28T22:00:00Z"), // mardi 29 septembre à Paris
  summary: { newUsers: 12, active: 87, ai: 3412, aiPrev: 3046 },
  peak: { value: 27, at: "2026-09-29T19:10:00Z" },
  groqAvailability: 0.9931,
  alerts: [],
  unavailable: [],
};

describe("buildDigest", () => {
  const normalize = (s: string) => s.replace(/[   ]/g, " ");
  it("résumé complet", () => {
    expect(normalize(buildDigest(base))).toBe(
      normalize(
        [
          "☀️ Noesis — résumé du mardi 29 septembre",
          "👥 Nouveaux inscrits : 12",
          "🟢 Actifs : 87",
          "🤖 Demandes IA : 3 412 (▲ 12 % vs veille)",
          "📈 Pic en ligne : 27 à 21:10",
          "⚡ Disponibilité API Groq : 99,3 %",
          "✅ Aucune alerte",
        ].join("\n"),
      ),
    );
  });
  it("baisse, alertes et sources indisponibles", () => {
    const txt = buildDigest({
      ...base,
      summary: { newUsers: 0, active: 3, ai: 50, aiPrev: 100 },
      peak: null,
      groqAvailability: null,
      alerts: [
        { id: 1, rule_key: "groq_slow", opened_at: "", resolved_at: "", message: "" },
        { id: 2, rule_key: "supabase_db", opened_at: "", resolved_at: null, message: "" },
      ],
      unavailable: ["relevés"],
    });
    expect(txt).toContain("🤖 Demandes IA : 50 (▼ 50 % vs veille)");
    expect(txt).toContain("📈 Pic en ligne : —");
    expect(txt).toContain("⚡ Disponibilité API Groq : —");
    expect(txt).toContain("🚨 Alertes : 2 (Groq lent, Base Noesis pleine)");
    expect(txt).toContain("⚠️ Données indisponibles : relevés");
  });
  it("activité Noesis indisponible", () => {
    expect(buildDigest({ ...base, summary: null })).toContain("👥 Activité : indisponible");
  });
});
