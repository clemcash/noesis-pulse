import { Tile, Unavailable } from "@/components/bento/tile";
import { TelegramTest } from "@/components/telegram-test";
import { RULE_META } from "@/lib/alerts/rules";
import { getAlertsPage } from "@/lib/data/alerts";
import { formatParis } from "@/lib/format";
import { updateRuleAction } from "./actions";

const when = (iso: string) => formatParis(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const STEP = { none: undefined, ms: 100, ratio: 0.05, count: 1, min: 1 } as const;

export default async function AlertsPage() {
  const { rules, alerts } = await getAlertsPage();
  const open = alerts.ok ? alerts.data.filter((a) => !a.resolved_at) : [];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Tile tone={open.length ? "hero" : "mint"} title="En cours">
        {!alerts.ok ? <Unavailable error={alerts.error} /> : open.length === 0 ? (
          <p className="text-2xl font-bold">Tout va bien ✅</p>
        ) : (
          <ul className="space-y-2">{open.map((a) => <li key={a.id}><div className="font-semibold">{a.message}</div><div className="text-xs opacity-75">depuis {when(a.opened_at)}</div></li>)}</ul>
        )}
      </Tile>

      <Tile tone="ink" className="lg:col-span-2" title="Notifications Telegram">
        <p className="mb-3 text-sm opacity-80">Une alerte est envoyée à son ouverture, puis un message « ✅ Résolu » quand tout revient à la normale. Résumé quotidien à 8h.</p>
        <TelegramTest />
      </Tile>

      <Tile className="lg:col-span-3" title="Règles et seuils">
        {!rules.ok ? <Unavailable error={rules.error} /> : (
          <div className="divide-y divide-ink/10">
            {rules.data.map((r) => {
              const meta = RULE_META[r.key];
              return (
                <form key={r.key} action={updateRuleAction} className="flex flex-wrap items-center gap-3 py-3">
                  <input type="hidden" name="key" value={r.key} />
                  <label className="flex min-w-56 flex-1 items-start gap-3">
                    <input type="checkbox" name="enabled" defaultChecked={r.enabled} className="mt-1 h-4 w-4 accent-violet" />
                    <span><b>{meta.label}</b><br /><span className="text-xs opacity-60">{meta.help}</span></span>
                  </label>
                  {meta.unit !== "none" && (
                    <input type="number" name="threshold" defaultValue={r.threshold} step={STEP[meta.unit]} min={0}
                      aria-label={`Seuil ${meta.label}`} className="w-28 rounded-lg border border-ink/15 px-3 py-1.5" />
                  )}
                  <button className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">Enregistrer</button>
                </form>
              );
            })}
          </div>
        )}
      </Tile>

      <Tile className="lg:col-span-3" title="Historique (50 dernières)">
        {!alerts.ok ? <Unavailable error={alerts.error} /> : alerts.data.length === 0 ? <p className="text-sm opacity-60">Aucune alerte pour l&apos;instant.</p> : (
          <ul className="divide-y divide-ink/10 text-sm">
            {alerts.data.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{a.message}</span>
                <span className="opacity-60">{when(a.opened_at)} → {a.resolved_at ? when(a.resolved_at) : <b className="text-rose">en cours</b>}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>
    </div>
  );
}
