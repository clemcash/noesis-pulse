# Noesis Pulse — design

Date : 2026-09-30 · Statut : validé en brainstorming, en attente de relecture

## 1. Objectif

Tableau de bord de suivi **privé** (un seul utilisateur : le créateur de Noesis), **déployé en ligne**, hyper visuel, pour voir en un coup d'œil :
- combien de personnes sont en ligne et l'activité en cours ;
- le volume de demandes IA (moyennes, pics, par fonctionnalité) ;
- les utilisateurs (liste + fiche individuelle, sans contenu de conversation) ;
- la santé et la consommation des APIs (Groq, Supabase) ;
- avec alertes Telegram et résumé quotidien.

### Contrainte impérative
**Aucune modification de Noesis** : ni code, ni migration, ni rôle/table/fonction dans sa base. Dépendance strictement unidirectionnelle `Pulse → Noesis`, en lecture seule. Noesis ne connaît pas l'existence de Pulse.

### Hors périmètre (V1)
- Multi-clients / multi-projets (ce n'est pas un produit commercial).
- Lecture du contenu des conversations.
- Présence temps réel exacte (impossible sans modifier Noesis → estimation, voir §5).
- Coût en € des APIs (Groq gratuit ; Supabase plan gratuit → on suit les limites, pas un coût).

## 2. Stack

- **App** : Next.js 16 (App Router) + TypeScript + Tailwind 4 + Recharts, déployée sur **Vercel**. Même stack que `projet-bot-post`.
- **Base de Pulse** : un **projet Supabase séparé** (gratuit) : auth + stockage des relevés + planification (`pg_cron` + `pg_net`).
  - Raison : le cron Vercel Hobby n'est que quotidien ; les relevés sont toutes les 5 min.
- **Accès Noesis** : **Supabase Management API** avec un jeton d'accès personnel (PAT) :
  - `POST /v1/projects/{ref}/database/query` → SQL agrégé en lecture sur la base Noesis ;
  - endpoints d'usage / analytics → compteurs de requêtes API, taille base et stockage.
- **Groq** : sonde synthétique avec la clé de Noesis (lecture des en-têtes `x-ratelimit-*`).
- **Alertes** : bot Telegram (Bot API `sendMessage`).
- **Tests** : Vitest.

Emplacement : `C:\Users\clecl\OneDrive\Bureau\intellect-lab\noesis-pulse` (dossier frère de Noesis, dépôt git indépendant). Dev server sur le port **3020** (Noesis = 3000, bot-post = 3010).

## 3. Architecture

```
noesis-pulse (Vercel)
├─ POST /api/collect   ← pg_cron toutes les 5 min (Supabase Pulse, pg_net) · header secret
│   1. noesis.collect()   SQL via Management API
│   2. supabaseUsage()    usage API, taille base, stockage (Management API)
│   3. groqProbe()        sonde 120b + 20b
│   4. insert snapshots   + alerts.evaluate(snapshot)
├─ POST /api/digest    ← pg_cron quotidien 8h (Europe/Paris) · header secret → Telegram
├─ POST /api/health-check ← pg_cron toutes les 15 min · header secret (alerte collector_stale)
├─ POST /api/alerts/test  (depuis la page Alertes, session requise)
└─ Pages (Server Components, lecture seule, rafraîchies toutes les 60 s côté client)
    /             Vue d'ensemble
    /users        Utilisateurs  → /users/[id]  Fiche
    /apis         IA & APIs
    /alerts       Alertes
    /login        Lien magique
```

### Modules (une responsabilité chacun)

| Module | Rôle | Dépend de |
|---|---|---|
| `lib/noesis/client.ts` | Exécute un SQL sur Noesis via Management API. **Refuse tout ce qui n'est pas un `SELECT`/`WITH … SELECT` unique.** Seul point de contact avec la base Noesis. | PAT, ref projet |
| `lib/noesis/queries.ts` | Les requêtes SQL nommées (en ligne, demandes par tranche, par fonctionnalité, utilisateurs, fiche, derniers inscrits). Pures chaînes + mapping typé. | client |
| `lib/sources/supabase-usage.ts` | Usage API, taille base, stockage de Noesis. | PAT |
| `lib/sources/groq-probe.ts` | Sonde : 1 requête minuscule (`max_tokens` minimal) par modèle ; retourne `{ ok, latencyMs, remainingRequests, remainingTokens, limit* }`. | clé Groq |
| `lib/collect.ts` | Orchestration d'un relevé ; chaque source isolée (`Promise.allSettled`), erreurs consignées. | sources, store |
| `lib/store.ts` | Lecture/écriture `snapshots`, `alerts`, `alert_rules` dans la base Pulse. | Supabase Pulse |
| `lib/alerts/rules.ts` | Fonctions pures : `(snapshot, historique, règles, alertes ouvertes) → { toOpen, toResolve }`. | — |
| `lib/alerts/telegram.ts` | Envoi Telegram. | token bot |
| `lib/digest.ts` | Fonction pure qui construit le texte du résumé. | — |
| `lib/demo.ts` | Générateur de données fictives (mode démo local uniquement). | — |
| `components/bento/*` | Tuiles et graphiques. | — |

## 4. Données de Noesis utilisées (lecture seule)

Tables : `auth.users`, `auth.sessions`, `public.messages`, `public.conversations`, `public.debates`, `public.debate_turns`, `public.challenges`, `public.challenge_turns`, `public.documents`, `public.skill_events`.

Jamais lues : les colonnes `content` (messages, tours), `question`/`goal` des défis, `topic` des débats. Les requêtes n'utilisent que des identifiants, dates, rôles, statuts, modes, tailles.

## 5. Définitions des métriques

- **Demande IA** : une ligne `role = 'assistant'` dans `messages`, `debate_turns` ou `challenge_turns`. Fonctionnalité = source (`messages` → « Chat », ventilé par `conversations.mode` ; `debate_turns` → « Débats » ; `challenge_turns` → « Défis »). Angle mort connu : les appels IA non persistés (ex. quick-profile) ne sont pas comptés.
- **Documents** : uploads `documents` (et nombre en `status = 'error'`).
- **Action utilisateur** : ligne `role = 'user'` dans les 3 tables de tours/messages, ou création de `documents`.
- **En ligne** (estimation) : nombre d'utilisateurs distincts ayant, dans les **5 dernières minutes**, une action utilisateur **ou** une session `auth.sessions` avec `refreshed_at`/`updated_at` récent. Affiché avec la mention « estimation ».
- **Actif (période)** : au moins une action utilisateur dans la période.
- **Nouveaux inscrits** : `auth.users.created_at` dans la période.
- **Demandes / h moyenne** : demandes IA de la période ÷ heures de la période.

## 6. Base de Pulse (Supabase séparé)

```sql
snapshots (
  id bigserial pk,
  taken_at timestamptz not null default now(),
  online int,                       -- null si source KO
  ai_requests_5m int,
  by_feature jsonb,                 -- {"chat":n,"debates":n,"challenges":n,"documents":n}
  groq jsonb,                       -- {"gpt-oss-120b":{ok,latencyMs,remainingTokens,...}, "gpt-oss-20b":{...}}
  supabase jsonb,                   -- {apiRequests24h, dbBytes, dbLimitBytes, storageBytes, storageLimitBytes}
  errors jsonb                      -- {"noesis": "...", "groq": "...", ...} ou null
)
alert_rules (key text pk, enabled bool, threshold numeric, params jsonb)
alerts (id bigserial pk, rule_key text, opened_at timestamptz, resolved_at timestamptz, message text)
```
RLS activée, aucun accès `anon`/`authenticated` direct : tout passe par le serveur (clé service_role **de Pulse**).
Rétention : relevés conservés 90 jours (purge dans le job de collecte).

## 7. Pages

Direction visuelle : **bento coloré** (tuiles de tailles variées, dégradés violet/rose, pastels jaune/vert/bleu/rose, tuile sombre pour la santé technique). Maquette validée : `.superpowers/brainstorm/*/content/pages-overview.html`.
Sélecteur de période global : 24 h / 7 j / 30 j. Horodatage « relevé il y a X min ». Tuile en échec → grisée « donnée indisponible ».

- **Vue d'ensemble** : En ligne maintenant (grande tuile, pic du jour, mini-courbe issue des relevés) · Demandes IA (total + moyenne/h + variation vs période précédente) · Utilisateurs (total + nouveaux) · Actifs 7 j (+ % des inscrits) · Histogramme demandes/heure · Santé des APIs (latences Groq, quota, API Supabase, base, stockage, requêtes 24 h) · Répartition par fonctionnalité · Derniers inscrits (email masqué partiellement).
- **Utilisateurs** : table triable/filtrable (email, inscription, dernière activité, nb de demandes IA, fonctionnalités utilisées) → **Fiche** : courbe d'activité, répartition par fonctionnalité, compétences (`skill_events` : score moyen par skill), nb de documents. Pas de contenu.
- **IA & APIs** : latence Groq dans le temps (120b vs 20b), disponibilité %, quota restant, requêtes Supabase, taille base/stockage dans le temps, documents en erreur.
- **Alertes** : historique (ouvertes / résolues), seuils éditables, bouton « tester Telegram ».

## 8. Alertes et résumé

Règles par défaut (éditables) :
| clé | condition |
|---|---|
| `groq_down` | modèle 120b `ok=false` sur 2 relevés consécutifs |
| `groq_slow` | latence 120b > 5000 ms sur 2 relevés consécutifs |
| `groq_quota` | quota journalier consommé > 80 % |
| `supabase_db` | taille base > 80 % de la limite |
| `supabase_storage` | stockage > 80 % de la limite |
| `activity_drop` | 0 demande IA sur 2 h, entre 8h et 23h (Paris), alors que la même tranche J-7 en comptait ≥ 5 |
| `collector_stale` | aucun relevé depuis 15 min — vérifié par un 2ᵉ job `pg_cron` (toutes les 15 min) qui appelle `POST /api/health-check`. Limite assumée : si Vercel entier est indisponible, aucune alerte ne part. |

Anti-spam : une alerte n'est envoyée qu'à l'**ouverture** ; message « ✅ résolu » à la fermeture ; pas de réenvoi tant qu'elle est ouverte.

Résumé quotidien (8h Paris) : nouveaux inscrits, actifs, demandes IA (variation vs J-1), pic d'en ligne et heure, disponibilité Groq %, alertes de la veille.

## 9. Erreurs

- Sources isolées : une source en échec n'empêche pas le relevé ; champ à `null` + message dans `errors`.
- **Jamais de repli silencieux vers des données fictives en production.** Le mode démo n'est actif que si `PULSE_DEMO=1` **et** `NODE_ENV !== 'production'`.
- Timeouts : 10 s par source ; le collecteur répond en < 30 s.
- Erreur d'envoi Telegram : consignée, ne fait pas échouer le relevé.

## 10. Sécurité

- Secrets uniquement côté serveur (variables Vercel) : `NOESIS_PROJECT_REF`, `SUPABASE_MANAGEMENT_TOKEN`, `GROQ_API_KEY`, `PULSE_SUPABASE_URL`, `PULSE_SUPABASE_SERVICE_ROLE_KEY`, `PULSE_SUPABASE_ANON_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `CRON_SECRET`, `ALLOWED_EMAIL`.
- Auth : Supabase Auth de Pulse, lien magique ; middleware sur toutes les pages : session valide **et** email = `ALLOWED_EMAIL`, sinon redirection `/login`. Inscriptions désactivées dans le projet Pulse.
- `/api/collect`, `/api/digest` et `/api/health-check` : header `Authorization: Bearer ${CRON_SECRET}` requis.
- Garde SQL : une seule instruction, commençant par `select` ou `with`, sans mots-clés d'écriture/DDL (`insert|update|delete|drop|alter|create|grant|truncate|copy|call|do`).
- Emails affichés partiellement masqués sur la vue d'ensemble ; complets sur la page Utilisateurs.
- Le PAT Supabase donne un accès total au compte : ne jamais le logger ni l'exposer au client.

## 11. Tests

- Unitaires (Vitest) : garde SQL, règles d'alerte (ouverture / résolution / anti-spam / 2 relevés consécutifs / fenêtre horaire), construction du résumé, agrégations (moyennes, variations, pic), mapping des résultats SQL.
- Orchestration `collect` avec sources simulées : une source KO → relevé partiel + erreur consignée.
- Mode démo local pour développer l'UI sans clés.
- Vérification manuelle finale : un relevé réel sur Noesis, un envoi Telegram de test.

## 12. Mise en place (côté utilisateur)

1. Créer le projet Supabase « noesis-pulse » ; activer `pg_cron` et `pg_net` ; désactiver les inscriptions.
2. Créer un PAT Supabase (Account → Access Tokens).
3. Créer un bot Telegram (@BotFather) et récupérer le `chat_id`.
4. Déployer sur Vercel avec les variables d'environnement ; exécuter la migration Pulse (tables + jobs `pg_cron`).
