import { Tile, Unavailable } from "@/components/bento/tile";
import { getFeedbackPage } from "@/lib/feedback/data";
import { batchLinks } from "@/lib/feedback/github";
import { KINDS, KIND_META, weekStats, type FeedbackItem } from "@/lib/feedback/model";
import { formatParis, maskEmail } from "@/lib/format";
import { generateAction, setStatusAction, syncAction } from "./actions";

const when = (iso: string) => formatParis(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (d: string) => formatParis(`${d}T12:00:00Z`, { day: "numeric", month: "short" });

const KIND_TONE: Record<string, string> = {
  bug: "bg-blush",
  ia: "bg-sky",
  ux: "bg-sun",
  idee: "bg-mint",
  positif: "bg-ink/5",
};

const FIELDS = [
  { key: "utile", label: "Utile" },
  { key: "bugs", label: "Bugs" },
  { key: "ia", label: "IA" },
  { key: "idees", label: "Idées" },
] as const;

function StatusButton({ id, status, children }: { id: number; status: string; children: string }) {
  return (
    <button formAction={setStatusAction} name="set" value={`${id}:${status}`}
      className="rounded-full px-2.5 py-1 text-xs opacity-60 hover:bg-ink/10 hover:opacity-100">
      {children}
    </button>
  );
}

function ItemRow({ item, selectable }: { item: FeedbackItem; selectable: boolean }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {selectable && (
        <input type="checkbox" name="item" value={item.id} defaultChecked={item.mentions > 1}
          aria-label={`Traiter : ${item.title}`} className="mt-1 h-4 w-4 shrink-0 accent-violet" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <b>{item.title}</b>
          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] font-semibold">
            {item.mentions} testeur{item.mentions > 1 ? "s" : ""}
          </span>
        </div>
        {item.detail && <p className="mt-0.5 text-sm opacity-75">{item.detail}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        {item.status === "new" ? (
          <>
            <StatusButton id={item.id} status="done">Déjà fait</StatusButton>
            <StatusButton id={item.id} status="rejected">Ignorer</StatusButton>
          </>
        ) : (
          <>
            {item.status === "sent" && <StatusButton id={item.id} status="done">Corrigé ✓</StatusButton>}
            <StatusButton id={item.id} status="new">Remettre</StatusButton>
          </>
        )}
      </div>
    </li>
  );
}

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const { items, responses, batches } = await getFeedbackPage();
  const all = items.ok ? items.data : [];
  const todo = all.filter((i) => i.status === "new" && i.kind !== "positif");
  const liked = all.filter((i) => i.status === "new" && i.kind === "positif");
  const sent = all.filter((i) => i.status === "sent");
  const closed = all.filter((i) => i.status === "done" || i.status === "rejected").slice(0, 30);
  const weeks = responses.ok ? weekStats(responses.data) : [];
  const thisWeek = weeks[0];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {(sp.ok || sp.err) && (
        <p role="status" className={`rounded-2xl px-4 py-3 text-sm font-medium lg:col-span-3 ${sp.err ? "bg-bad/30" : "bg-mint"}`}>
          {sp.err ?? sp.ok}
        </p>
      )}

      <Tile tone="hero" title="Questionnaire de la semaine">
        {!responses.ok ? <Unavailable error={responses.error} /> : thisWeek ? (
          <>
            <p className="text-4xl font-bold">{thisWeek.responses} <span className="text-lg font-semibold opacity-80">réponse{thisWeek.responses > 1 ? "s" : ""}</span></p>
            <p className="mt-1 text-sm opacity-85">
              Semaine du {day(thisWeek.week)}{thisWeek.avgNote != null && <> · note moyenne <b>{thisWeek.avgNote}/5</b></>}
            </p>
          </>
        ) : <p className="text-2xl font-bold">Aucune réponse pour l&apos;instant</p>}
      </Tile>

      <Tile tone="sun" title="Points à traiter">
        <p className="text-4xl font-bold">{todo.length}</p>
        <p className="mt-1 text-sm opacity-70">{sent.length} en cours de correction · {liked.length} point{liked.length > 1 ? "s" : ""} positif{liked.length > 1 ? "s" : ""}</p>
      </Tile>

      <Tile tone="ink" title="Relevé">
        <p className="text-sm opacity-80">Les réponses sont relevées chaque matin puis regroupées par l&apos;IA en points à traiter.</p>
        <form action={syncAction} className="mt-3">
          <button className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink">Relever maintenant</button>
        </form>
      </Tile>

      <Tile className="lg:col-span-2" title="Retours à traiter">
        {!items.ok ? <Unavailable error={items.error} /> : todo.length === 0 ? (
          <p className="text-sm opacity-60">Rien à traiter : les prochains retours arriveront après samedi.</p>
        ) : (
          <form action={generateAction}>
            {KINDS.filter((k) => k !== "positif").map((k) => {
              const list = todo.filter((i) => i.kind === k);
              if (!list.length) return null;
              return (
                <div key={k} className="mb-3">
                  <h3 className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${KIND_TONE[k]}`}>
                    {KIND_META[k].label} · {list.length}
                  </h3>
                  <ul className="divide-y divide-ink/10">{list.map((i) => <ItemRow key={i.id} item={i} selectable />)}</ul>
                </div>
              );
            })}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
              <button className="rounded-full bg-gradient-to-br from-violet to-rose px-5 py-2.5 text-sm font-bold text-white shadow-sm">
                ✨ Générer des solutions
              </button>
              <p className="max-w-md text-xs opacity-60">
                Lance Claude sur le dépôt de Neosis : il code des correctifs ciblés pour les points cochés et ouvre une
                pull request. Rien n&apos;est mis en ligne sans ta validation.
              </p>
            </div>
          </form>
        )}
      </Tile>

      <div className="flex flex-col gap-3">
        <Tile tone="mint" title="Ce qui plaît (à garder)">
          {liked.length === 0 ? <p className="text-sm opacity-60">Rien pour l&apos;instant.</p> : (
            <form><ul className="divide-y divide-ink/10">{liked.map((i) => <ItemRow key={i.id} item={i} selectable={false} />)}</ul></form>
          )}
        </Tile>

        <Tile title="Zones verrouillées">
          <p className="text-sm opacity-75">
            Jamais modifiées par la génération : landing page, identité visuelle (planète, couleurs), paiements et
            tarifs, base de données, mentions légales. Un retour isolé ne change pas un choix de design.
          </p>
        </Tile>
      </div>

      <Tile className="lg:col-span-2" title="En cours de correction">
        {sent.length === 0 ? <p className="text-sm opacity-60">Aucun lot en cours.</p> : (
          <form><ul className="divide-y divide-ink/10">{sent.map((i) => <ItemRow key={i.id} item={i} selectable={false} />)}</ul></form>
        )}
      </Tile>

      <Tile title="Lots envoyés">
        {!batches.ok ? <Unavailable error={batches.error} /> : batches.data.length === 0 ? (
          <p className="text-sm opacity-60">Aucun lot pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-ink/10 text-sm">
            {batches.data.map((b) => {
              const links = batchLinks(b.branch);
              return (
                <li key={b.id} className="py-2">
                  <div className="flex justify-between gap-2">
                    <b>Lot n°{b.id}</b>
                    <span className="opacity-60">{when(b.created_at)}</span>
                  </div>
                  {b.status === "error" ? (
                    <p className="text-xs text-rose">Échec : {b.error}</p>
                  ) : (
                    <p className="text-xs">
                      {b.item_ids.length} point(s) ·{" "}
                      <a href={links.pr} target="_blank" rel="noreferrer" className="font-semibold text-violet underline">pull request</a>{" "}
                      · <a href={links.runs} target="_blank" rel="noreferrer" className="underline opacity-70">exécution</a>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Tile>

      <Tile className="lg:col-span-3" title="Dernières réponses">
        {!responses.ok ? <Unavailable error={responses.error} /> : responses.data.length === 0 ? (
          <p className="text-sm opacity-60">Aucune réponse pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-ink/10">
            {responses.data.slice(0, 40).map((r) => (
              <li key={r.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <b className="w-10">{r.note ?? "?"}/5</b>
                    <span>{r.email ? maskEmail(r.email) : "anonyme"}</span>
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs">{r.track === "junior" ? "Junior" : "Lycée"}</span>
                    <span className="ml-auto text-xs opacity-60">{when(r.submitted_at)}</span>
                  </summary>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                    {FIELDS.map((f) => {
                      const v = r.answers[f.key];
                      return typeof v === "string" && v.trim() ? (
                        <div key={f.key} className="rounded-xl bg-ink/5 p-3">
                          <dt className="text-[11px] font-semibold uppercase tracking-wider opacity-60">{f.label}</dt>
                          <dd className="mt-1 whitespace-pre-wrap">{v}</dd>
                        </div>
                      ) : null;
                    })}
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      {closed.length > 0 && (
        <Tile tone="muted" className="lg:col-span-3" title="Clos récemment">
          <form>
            <ul className="divide-y divide-ink/10">{closed.map((i) => <ItemRow key={i.id} item={i} selectable={false} />)}</ul>
          </form>
        </Tile>
      )}
    </div>
  );
}
