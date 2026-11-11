<p align="center"><img src="apps/web/static/logo.svg" width="96" alt="Mealler"></p>

# Mealler

Diario alimentare **self-hosted**, **multiutente**, installabile come **PWA** su telefono e desktop.
Registri cosa mangi negli slot che decidi tu, tieni d'occhio calorie e macronutrienti rispetto alle tue soglie (tutte facoltative) e ti fai aiutare da Claude per il calcolo.

> *English summary below.*

## Stato

Versione **1.5.0**: diario con promemoria push, uso offline, libreria alimenti condivisa con la foto della tabella nutrizionale, icone colorate per le categorie di alimenti, una voce per ogni alimento con quantità a tag, sistema metrico o americano, calendario dei giorni completi, pasti saltati e slot in più per un giorno, connettore per claude.ai e calcolo AI dentro l'app, anche da foto, piatti con i loro ingredienti e traguardi con medaglie.

| Funzione | Stato |
| --- | --- |
| Primo avvio con creazione dell'amministratore | ✅ |
| Utenti, inviti, registrazione libera opzionale | ✅ |
| Slot dei pasti personalizzabili (orario, giorni, ordine) | ✅ |
| Diario giornaliero con inserimento manuale di kcal e macro | ✅ |
| Soglie minime e massime facoltative, versionate nel tempo | ✅ |
| Tema chiaro/scuro, italiano e inglese, PWA installabile | ✅ |
| Promemoria push per gli slot, fascia di silenzio, pausa | ✅ |
| Consultazione offline e inserimenti in coda | ✅ |
| Connettore per claude.ai (MCP + OAuth 2.1) | ✅ |
| Calcolo con l'API Anthropic, anche da foto | ✅ |
| Preferiti, grafici, peso, export, pagina Novità | ✅ |
| Libreria alimenti condivisa: codice a barre, Open Food Facts, foto dell'etichetta | ✅ |
| Eliminazione dell'account, intestazioni di sicurezza, guida d'installazione | ✅ |
| Icone delle categorie di alimenti, riconosciute dal nome o scelte a mano | ✅ |
| Una voce per alimento, quantità a tag, sistema metrico o americano, swipe per eliminare | ✅ |
| Calendario dei giorni completi, pasti saltati, slot in più per un giorno | ✅ |
| Piatti con ingredienti come una sola voce, consigli per scrivere | ✅ |
| Traguardi con medaglie, calcolati dal diario | ✅ |

## Installazione con Docker

```bash
git clone https://github.com/Yanez86/mealler.git
cd mealler
cp .env.example .env        # modifica porta e fuso orario se serve
docker compose up -d --build
```

Poi apri `http://IP-DEL-SERVER:3000`: la prima pagina ti fa creare l'account amministratore.

- I dati (database SQLite) stanno nel volume `mealler-data`, montato su `/data`.
- Per installare la PWA sul telefono e ricevere in futuro le notifiche serve **HTTPS**: metti Mealler dietro un reverse proxy (Caddy, Traefik, nginx o quello integrato nel tuo NAS) e imposta `MEALLER_BASE_URL`.
- Aggiornamento: `./aggiorna.sh` mostra i commit nuovi, chiede conferma, ricompila, fa un backup dei dati e riavvia (oppure a mano: `git pull && docker compose pull && docker compose up -d`). Le migrazioni del database partono da sole.
- Backup: copia il volume `/data` (database, `secret.key`, foto).

Guida completa (Cloudflare Tunnel, Caddy, Traefik, backup, ripristino, aggiornamenti): **[docs/INSTALL.md](docs/INSTALL.md)**. Sicurezza e segnalazioni: **[SECURITY.md](SECURITY.md)**.

### Variabili d'ambiente

| Variabile | Default | Descrizione |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP interna al container |
| `MEALLER_DATA_DIR` | `/data` | Cartella del database |
| `MEALLER_BASE_URL` | — | Indirizzo pubblico, usato per i link d'invito |
| `MEALLER_BIND` | `0.0.0.0` | Interfaccia su cui Docker pubblica la porta: `127.0.0.1` dietro un proxy o un tunnel (solo `docker-compose.yml`) |
| `MEALLER_TRUST_PROXY` | indirizzi privati e locali | Indirizzi o reti dei reverse proxy da cui accettare `X-Forwarded-*`; `none` per nessuno |
| `MEALLER_SOURCE_URL` | questo repo | Link al codice sorgente mostrato nell'app (AGPL) |
| `LOG_LEVEL` | `info` | Livello di log |
| `MEALLER_SECRET_KEY` | file `secret.key` in `/data` | Chiave per cifrare i segreti salvati nel database (es. la chiave API Anthropic) |
| `MEALLER_UPDATE_CHECK` | `true` | Controlla su GitHub se c'è una versione più recente (solo avviso agli admin) |

## Connettore claude.ai

1. Rendi Mealler raggiungibile da internet in HTTPS (reverse proxy o tunnel) e imposta `MEALLER_BASE_URL`.
2. Un amministratore attiva il connettore in **Profilo → Amministrazione**.
3. Ogni utente apre **Profilo → Connettore claude.ai**, copia l'indirizzo `https://…/mcp` e lo aggiunge in claude.ai come connettore personalizzato, lasciando vuoti i campi OAuth.

Mealler fa da server OAuth: nessun servizio esterno, e ogni utente vede solo il proprio diario.

## Sviluppo

Requisiti: Node.js 22 e pnpm 10.

```bash
pnpm install
pnpm --filter @mealler/server dev   # API su :3000 (usa ./data)
pnpm --filter @mealler/web dev      # interfaccia su :5173, con proxy verso /api
pnpm typecheck && pnpm test && pnpm build
```

Struttura: `apps/server` (Fastify, SQLite con Drizzle, migrazioni SQL in `apps/server/migrations`), `apps/web` (SvelteKit come SPA), `packages/shared` (tipi, calcoli, traduzioni).

Il sito di presentazione è in `site/`: `node site/build.mjs` lo crea in `site/dist` con il logo e le icone dell'app, e il workflow `pages.yml` lo pubblica su GitHub Pages (vedi [site/README.md](site/README.md)).

## Licenza

[GNU Affero General Public License v3.0 o successiva](LICENSE). Se offri Mealler ad altri tramite rete, devi rendere disponibile il codice sorgente, comprese le tue modifiche: l'app mostra già un link al sorgente nella pagina Profilo.

---

## English

Mealler is a self-hosted, multi-user food diary PWA. Log meals into slots you define, track calories and macros against optional min/max thresholds (with LARN reference values), get push reminders, work offline, keep a shared library of packaged foods (barcode, Open Food Facts, label photo kept with each food), and let Claude estimate nutritional values through a claude.ai connector (MCP + OAuth 2.1) or the Anthropic API, with per-user spending limits. Colored icons show each food's category, guessed from its name or chosen by hand. Several foods typed together become separate entries, quantities use unit tags, and metric or US customary units can be chosen. A month calendar shows complete days, meals can be marked as skipped and extra slots added for a single day. A dish typed with its ingredients becomes one entry, and achievements with medals reward firsts, streaks and totals. Version 1.5.0. Install with Docker: see [docs/INSTALL.md](docs/INSTALL.md); security policy in [SECURITY.md](SECURITY.md). Licensed under AGPL-3.0-or-later.
