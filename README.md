# Noesis Pulse

Tableau de bord privé de suivi de Noesis : en ligne (estimation), demandes IA, utilisateurs, santé Groq/Supabase, alertes et résumé quotidien Telegram.

**Noesis n'est jamais modifié.** Pulse lit sa base en `SELECT` uniquement via la Supabase Management API.

## Développer en local (sans aucune clé)

```bash
npm install
echo PULSE_DEMO=1 > .env.local
npm run dev   # http://localhost:3020 — données fictives, pas de connexion
npm test
```

## Mise en production

1. **Projet Supabase « noesis-pulse »** (séparé de Noesis, plan gratuit)
   - SQL Editor : exécuter `supabase/migrations/0001_pulse.sql`.
   - Database → Extensions : activer `pg_cron` et `pg_net`.
   - Authentication → Sign In / Providers : désactiver « Allow new users to sign up ».
   - Authentication → Users → « Add user » : créer ton compte avec `ALLOWED_EMAIL`.
   - Authentication → URL Configuration : Site URL = `https://<ton-domaine>` ; Redirect URLs = `https://<ton-domaine>/auth/callback` (+ `http://localhost:3020/auth/callback`).
2. **Jeton Supabase** : supabase.com → Account → Access Tokens → nouveau jeton → `SUPABASE_MANAGEMENT_TOKEN`. ⚠️ Il donne accès à tout ton compte : uniquement dans les variables Vercel.
3. **Telegram** : @BotFather → `/newbot` → `TELEGRAM_BOT_TOKEN`. Écrire un message au bot puis ouvrir `https://api.telegram.org/bot<TOKEN>/getUpdates` → `chat.id` → `TELEGRAM_CHAT_ID`.
4. **Vercel** : importer le dépôt, renseigner toutes les variables de `.env.example` **sauf** `PULSE_DEMO`. Définir `SITE_URL` à l'URL publique (ex. `https://<ton-domaine>`) — il est dans `.env.example` et est utilisé pour la redirection du lien magique. Déployer.
5. **Planification** (SQL Editor du projet Pulse) :
   ```sql
   select vault.create_secret('https://<ton-domaine>', 'pulse_url');
   select vault.create_secret('<CRON_SECRET>', 'pulse_cron_secret');
   ```
   puis exécuter `supabase/migrations/0002_cron.sql`.
6. **Vérifier** : `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<ton-domaine>/api/collect` → `{"ok":true,…}` ; page Alertes → « Tester Telegram ».

## Retours bêta (page « Retours bêta »)

Les 50 premiers comptes de Neosis sont testeurs : chaque samedi (heure de Paris), un questionnaire s'ouvre dans l'app à leur prochaine visite. Pulse relève les réponses chaque matin (`/api/feedback-sync`), les regroupe avec Groq en points à traiter (bugs, IA, interface, idées, ce qui plaît) et envoie un résumé Telegram. Le bouton **Générer des solutions** lance le workflow GitHub `beta-feedback.yml` du dépôt Neosis : Claude code des correctifs ciblés (jamais dans les zones verrouillées de `.github/beta-feedback/protected-paths.txt`), la CI vérifie, puis une pull request est ouverte. Rien n'est mis en ligne sans fusion manuelle.

Mise en place :
1. Base **Neosis** : exécuter `supabase/migrations/20261015120000_beta_feedback.sql` (dépôt intellect-lab).
2. Base **Pulse** : exécuter `supabase/migrations/0003_feedback.sql` (après `0002_cron.sql`).
3. Dépôt **intellect-lab** sur GitHub : fusionner le workflow dans `main` ; Settings → Secrets and variables → Actions → secret `CLAUDE_CODE_OAUTH_TOKEN` (obtenu avec `claude setup-token`, utilise l'abonnement Claude) ; Settings → Actions → General → cocher « Allow GitHub Actions to create and approve pull requests ».
4. **Vercel** (Pulse) : ajouter `GITHUB_DISPATCH_TOKEN` (jeton fine-grained limité au dépôt intellect-lab, permission *Actions : Read and write*).

## Ce qui est mesuré

- **En ligne** : utilisateurs distincts avec une action ou une session rafraîchie dans les 5 dernières minutes (estimation).
- **Demande IA** : une réponse `role = 'assistant'` enregistrée (chat, débats, défis). Les appels IA non enregistrés par Noesis ne sont pas comptés.
- **Groq** : `GET /models` à chaque relevé (gratuit) ; vraie sonde `gpt-oss-120b` toutes les 30 min et `gpt-oss-20b` toutes les heures (~72 requêtes/jour prises sur le quota de Noesis).
