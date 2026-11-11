# Mealler 1.4.1: documento delle criticità

Revisione del codice al commit `40dcc70` (release 1.4.1), fatta leggendo il sorgente. Nessun test dinamico né penetration test: ogni voce cita il file e la riga da cui nasce, e dove un'affermazione non è stata verificata sul codice è scritto «da verificare».

Tre parti: [sicurezza](#1-sicurezza), [usabilità](#2-usabilità), [consumi token e limiti](#3-consumi-token-e-rispetto-dei-limiti). In fondo l'[ordine di lavoro consigliato](#4-ordine-di-lavoro-consigliato).

> **Aggiornamento dell'11 novembre 2026.** Le voci sono state ricontrollate sul codice e in buona parte corrette: lo [stato voce per voce](#5-stato-delle-correzioni) è in fondo. Il testo delle sezioni 1-4 resta quello della revisione, cioè descrive la 1.4.1.

Gravità: **Alta** = da sistemare prima della prossima release; **Media** = da pianificare; **Bassa** = rifinitura o difesa in profondità.

## Sintesi

| Area | Alta | Media | Bassa |
| --- | --- | --- | --- |
| Sicurezza | 3 | 9 | 9 |
| Usabilità | 6 | 33 | 12 |
| Token e limiti | 4 | 7 | 4 |

Le cinque cose che contano di più:

1. **Il limite sui tentativi di login si aggira** con un'intestazione `X-Forwarded-For` inventata, proprio nella configurazione consigliata (Cloudflare Tunnel) — SEC-01.
2. **Di default non c'è nessun tetto in dollari** sull'uso dell'API Anthropic: né per utente né per istanza — TOK-01.
3. **I tetti in dollari si controllano sulla spesa già registrata**, quindi richieste in parallelo li superano; e una chiamata andata in timeout viene (probabilmente) fatturata da Anthropic ma non contata da Mealler — TOK-02, TOK-03.
4. **Chi cancella l'account cancella anche la propria spesa**: il budget mensile dell'istanza scende e, con la registrazione aperta, i limiti personali si azzerano ricreando l'account — TOK-04.
5. **Password dimenticata = account perso**: non esiste alcun modo di reimpostarla, nemmeno per l'amministratore — SEC-04.

---

## 1. Sicurezza

Il punto di vista è quello di chi installa Mealler sul proprio server o NAS: cosa può fare un estraneo da internet, cosa può fare un utente registrato contro il server o contro gli altri utenti, e cosa succede ai dati a riposo.

### Cosa è fatto bene

- Password con Argon2id, sessioni e token OAuth salvati solo come hash SHA-256, cookie `HttpOnly` + `SameSite=Lax` (`apps/server/src/auth.ts`).
- Ogni query del diario filtra su `userId`; non ho trovato rotte che leggano dati di un altro utente (IDOR) in `diary.ts`, `favorites.ts`, `weight.ts`, `insights.ts`, `mcp.ts`.
- Query sempre parametrizzate (Drizzle), validazione Zod su ogni ingresso, errori 500 senza dettagli interni (`http.ts`).
- CSP stretta con hash degli script inline, `frame-ancestors 'none'`, nessun CORS aperto (`security.ts`, `app.ts`).
- OAuth: PKCE S256 obbligatorio, codici monouso cancellati prima dei controlli, confronto a tempo costante, redirect solo verso URI registrati (`oauth.ts`).
- Chiave API Anthropic cifrata con AES-256-GCM e mai restituita al client (`secrets.ts`, `routes/ai.ts:55`).
- Il container gira come utente `node`, non root (`Dockerfile`).

### Alta

**SEC-01 · Il limite sui tentativi si aggira falsificando `X-Forwarded-For`**
`apps/server/src/app.ts:39` imposta `trustProxy: true`, cioè Fastify si fida di qualunque catena di proxy e prende come IP del client il primo indirizzo di `X-Forwarded-For`, che è scritto dal client. `@fastify/rate-limit` usa quell'IP come chiave. Cloudflare (il metodo 2a della guida) e nginx con `$proxy_add_x_forwarded_for` *accodano* l'IP vero all'intestazione ricevuta: basta cambiare il valore a ogni richiesta per avere tentativi illimitati su `/api/auth/login`, `/api/register`, `/api/setup`, `/oauth/register`, `/api/ai/estimate`. Lo stesso vale per chi raggiunge direttamente la porta 3000.
Conseguenze: forza bruta sulle password senza freno (resta solo il costo di Argon2), CPU del NAS saturata, tabella `oauth_clients` riempita a piacere.
*Direzione*: `trustProxy` configurabile (numero di hop o elenco di IP/reti fidate, default 1 hop), e in più un blocco per account (N tentativi falliti per email → attesa crescente), che non dipende dall'IP.

**SEC-02 · La porta 3000 resta pubblicata su tutte le interfacce anche dietro proxy o tunnel**
`docker-compose.yml:11` pubblica `${MEALLER_PORT:-3000}:3000` su `0.0.0.0`. La guida dice che «puoi togliere» la riga quando usi un proxy, ma il default la lascia: l'app resta raggiungibile in HTTP semplice dalla LAN (e da internet se il server ha un IP pubblico: le porte pubblicate da Docker scavalcano `ufw`), con cookie di sessione senza `Secure` (`auth.ts:57`) e con SEC-01 sfruttabile senza passare dal proxy.
*Direzione*: nelle ricette con tunnel/proxy togliere `ports:` o legarla a `127.0.0.1`; documentarlo come passo obbligato, non facoltativo.

**SEC-03 · Le dipendenze dell'immagine non sono quelle del lockfile**
`Dockerfile:12` usa `pnpm install --no-frozen-lockfile` e `Dockerfile:17` installa le dipendenze di produzione con `npm install --omit=dev --no-package-lock` a partire dagli intervalli `^` di `package.json`. L'immagine pubblicata contiene quindi versioni risolte al momento della build, diverse da quelle provate in CI e da build a build. Una versione compromessa o difettosa di una dipendenza transitiva entra nell'immagine senza che nessun commit la mostri. Stesso discorso per la CI (`ci.yml:17`), per le immagini base non fissate a un digest e per `image: …:latest` nel compose.
*Direzione*: `--frozen-lockfile` ovunque, dipendenze di produzione ricavate dal lockfile (`pnpm deploy --prod`), immagine base e action fissate, tag di versione nel compose di esempio.

### Media

**SEC-04 · Nessun recupero della password, nemmeno per l'amministratore**
`routes/admin.ts` permette solo di attivare/disattivare un utente e cambiarne il ruolo; non c'è reimpostazione della password né un comando da riga di comando. Un utente che la dimentica perde il diario; se è l'unico amministratore, l'istanza resta senza amministrazione (chiave API, limiti di spesa, inviti) e l'unica via è modificare il database a mano.
*Direzione*: reimpostazione da parte dell'admin (link monouso, come gli inviti) e un comando `docker exec` documentato per l'admin.

**SEC-05 · Cambiare password non revoca gli accessi del connettore**
`routes/auth.ts:150-158` cancella le altre sessioni ma non tocca `oauth_tokens`: un client claude.ai (o chi ha rubato un refresh token, valido 90 giorni, `oauth.ts:20`) continua a leggere e scrivere il diario dopo il cambio password. Inoltre la rotazione dei refresh token non rileva il riuso (`oauth.ts:288-303`): un token rubato e usato per primo taglia fuori il legittimo proprietario senza allarmi.
*Direzione*: al cambio password revocare anche i token OAuth (o chiederlo esplicitamente); al riuso di un refresh token già ruotato revocare l'intera famiglia.

**SEC-06 · SSRF cieca tramite le notifiche push**
`routes/push.ts:18` accetta come `endpoint` qualunque URL `https://`; `push.ts:46` ci fa poi una POST dal server, e `/api/push/test` la scatena a comando. Un utente registrato può far partire richieste HTTPS dal NAS verso host interni o arbitrari (senza leggerne la risposta, ma distinguendo «consegnata» da «errore»).
*Direzione*: accettare solo gli host dei servizi push noti (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`).

**SEC-07 · Registrazione dinamica dei client OAuth aperta e senza pulizia**
Con il connettore attivo, `/oauth/register` (`oauth.ts:207`) è pubblico: chiunque crea client con nome e redirect a scelta. Il limite è 20/ora per IP (aggirabile, SEC-01) e i client mai usati non vengono mai cancellati. Il nome è libero: un client può chiamarsi «Claude» e la schermata di consenso (`consent/+page.svelte`) lo mostra così, con il solo host di ritorno a distinguere il vero dal falso.
*Direzione*: scadenza dei client senza token, tetto al numero totale, e nella schermata di consenso dare più evidenza all'host di destinazione che al nome dichiarato.

**SEC-08 · `MEALLER_SECRET_KEY`, `MEALLER_UPDATE_CHECK` e `LOG_LEVEL` non arrivano al container**
Il README le documenta, ma `docker-compose.yml:13-16` passa solo `TZ` e `MEALLER_BASE_URL`. Chi mette `MEALLER_UPDATE_CHECK=false` in `.env` crede di aver spento la chiamata a GitHub e non è così; chi imposta `MEALLER_SECRET_KEY` per tenere la chiave fuori dal volume continua a usare `secret.key` nel volume.
*Direzione*: aggiungere le variabili al compose (o `env_file: .env`).

**SEC-09 · Backup leggibili da altri utenti del server**
`aggiorna.sh:149` crea `backups/mealler-*.tgz` con i permessi di default (di norma `644`), e con `sudo` appartengono a root. Dentro ci sono database, `secret.key` e foto: tutto quello che serve per leggere i diari e decifrare la chiave API. Lo stesso vale per i comandi manuali di `docs/INSTALL.md` §4.
*Direzione*: `umask 077` nello script, cartella `backups/` a `700`, nota nella guida.

**SEC-10 · La chiave di cifratura sta accanto al dato che protegge**
`secret.key` è nello stesso volume del database (`secrets.ts:17`): la cifratura protegge solo da una copia del *solo* file `.db`. La chiave privata VAPID è invece in chiaro nella tabella `settings` (`push.ts:25-27`). È una scelta dichiarata nella documentazione, ma va resa aggirabile davvero (vedi SEC-08).

**SEC-11 · CSRF: nessun controllo dell'origine, e i form sono accettati su tutte le rotte**
La protezione è affidata a `SameSite=Lax`. `app.ts:48` registra però il parser `application/x-www-form-urlencoded` globalmente (serve solo a `/oauth/token`), quindi un form HTML può colpire le rotte `/api` i cui campi sono tutte stringhe: `POST /api/admin/users` (nome, email, password, `role=admin`) è tra queste. `Lax` ferma i siti estranei, non una pagina sullo *stesso sito* (un altro servizio su un sottodominio dello stesso dominio, situazione tipica di un homelab).
*Direzione*: limitare il parser dei form alle rotte OAuth e rifiutare le richieste di modifica con `Origin`/`Sec-Fetch-Site` non coerenti.

**SEC-12 · Riempimento del disco da parte di un utente registrato**
Nessun limite di frequenza né di quantità su `POST /api/products` e `PUT /api/products/:id/label` (fino a ~6 MB per etichetta, `routes/products.ts:214`), né su `/mcp`, né sul numero di voci, preferiti o slot. Con «conserva le foto» attivo, ogni stima salva la foto (`routes/ai.ts:40`) anche se poi la voce non viene salvata o viene ricalcolata: quei file restano orfani fino alla cancellazione dell'account (`deletePhoto` è chiamata solo quando si elimina una voce, `routes/diary.ts:254,266`).
*Direzione*: quota per utente, pulizia periodica delle foto non collegate a voci, limite globale di frequenza sulle scritture.

### Bassa

- **SEC-13 · Enumerazione degli utenti.** `/api/register` risponde `emailTaken` (`routes/auth.ts:97`); il login esegue Argon2 solo se l'email esiste (`routes/auth.ts:63`), quindi i tempi di risposta distinguono gli account esistenti.
- **SEC-14 · Argon2 prima dei controlli.** `/api/setup` calcola l'hash prima di verificare che l'istanza sia vuota (`routes/auth.ts:52-54`): lavoro di CPU a disposizione di chi non è autenticato, limitato solo dal rate limit di SEC-01.
- **SEC-15 · Token d'invito nei log.** L'invito viaggia nell'URL (`/register?token=…`, `/api/invites/:token`) e finisce nei log di accesso di Fastify e del proxy.
- **SEC-16 · Sessioni.** Durata 30 giorni con rinnovo automatico, nessun elenco dei dispositivi collegati né «esci da tutti» se non cambiando password; nessun secondo fattore.
- **SEC-17 · `/api/status` pubblico** espone versione installata e ultima disponibile (`routes/auth.ts:34`): comodo per chi cerca istanze non aggiornate.
- **SEC-18 · Host dei link ricavato dalla richiesta.** Senza `MEALLER_BASE_URL`, link d'invito e metadati OAuth usano `Host`/`X-Forwarded-Host` (`admin.ts:28`, `oauth.ts:24`). Con il connettore attivo conviene rendere `MEALLER_BASE_URL` obbligatoria.
- **SEC-19 · Container senza restrizioni aggiuntive.** Nel compose mancano `read_only`, `cap_drop: [ALL]`, `security_opt: no-new-privileges`, limiti di memoria.
- **SEC-20 · Aggiornamenti senza verifica.** `aggiorna.sh` compila ed esegue ciò che trova sul ramo: nessun tag firmato o digest. Accettabile per un progetto personale, ma è il punto in cui un account GitHub compromesso diventa codice in esecuzione sui NAS degli utenti. Le action dei workflow sono fissate a tag, non a commit.
- **SEC-21 · Percorso assoluto delle foto nel database** (`ai.ts:546`): dopo un ripristino in una cartella dati diversa le foto non si trovano più. Problema di robustezza più che di sicurezza.

---

## 2. Usabilità

Analisi statica dell'interfaccia (`apps/web/src`, percorsi relativi a questa cartella): l'app non è stata avviata. Le voci di gravità alta sono state ricontrollate una per una sul codice; dove serve una prova sul dispositivo è scritto «da verificare».

### Quanti tocchi servono per registrare un pasto

| Modo | Percorso | Tocchi |
| --- | --- | --- |
| Testo | Oggi → «+» sullo slot → scrivi → Salva | 2 + digitazione |
| Preferito | «+» → chip → Salva | 3 |
| Libreria | «+» → cerca → risultato → Aggiungi | 3 + digitazione |
| Codice a barre già in libreria | «+» → scanner → scansione → Aggiungi | 3 |
| Codice a barre nuovo | si esce dal flusso (USA-03) | molti |
| Foto | «+» → Foto del piatto → selettore → attesa → Salva | ~4 |

Il percorso base è corto. I problemi stanno in cosa succede quando qualcosa esce dal caso normale.

### Cosa è fatto bene

- Eliminazione delle voci del diario: swipe, rimozione immediata con «Annulla», invio garantito se l'app va in background (`routes/+page.svelte:45-112`), cestino raggiungibile da tastiera e lettore di schermo.
- Lettura offline del diario e coda locale per le voci nuove, con avviso «in attesa di sincronizzazione».
- Campi numerici con `inputmode="decimal"`, virgola accettata, carattere a 16 px (niente zoom su iOS).
- Accessibilità di base curata: etichette su tutti i campi, stato reso con icona e testo oltre al colore, tabelle nascoste per i grafici, `prefers-reduced-motion` rispettato.
- Notifiche chieste solo su gesto esplicito, con messaggi distinti per iOS non installato, permesso negato, contesto non sicuro.
- Parità delle traduzioni it/en garantita dai tipi; le stime AI sono dichiarate come tali, con livello di confidenza.

### Alta

**USA-01 · «Oggi» resta fermo a ieri se l'app rimane aperta oltre mezzanotte**
`routes/+page.svelte:36,249` calcolano `today` e `nowTime` una volta sola; l'unico ascolto di `visibilitychange` (`:110`) serve alle eliminazioni. La PWA ripresa il mattino dopo mostra ieri come «Oggi» e i «+» portano a `/add?…&d=<ieri>`: i pasti finiscono nel giorno sbagliato. Stesso problema in `routes/trends/+page.svelte:13` e `lib/WeightPanel.svelte:12`.

**USA-02 · Nessun aggiornamento dei dati al ritorno in primo piano**
Il caricamento del giorno dipende solo da data e coda offline (`routes/+page.svelte:131-140`). Un pasto registrato da claude.ai o da un altro dispositivo non compare finché non si cambia giorno o pagina. Per un'app che ha un connettore come funzione di punta è il difetto più visibile.

**USA-03 · Codice a barre non in libreria: si viene portati fuori dal pasto e non si torna**
`lib/LibraryPicker.svelte:59` fa `goto('/favorites?tab=foods&barcode=…')`: slot, data e alimenti già scritti sono persi; salvato il prodotto si resta nella lista alimenti (`routes/favorites/+page.svelte:63-90`) e bisogna rifare tutto. Il codice viene inoltre cercato due volte, e ogni ricerca può attendere Open Food Facts fino a 8 s più la foto dell'etichetta (`apps/server/src/foods.ts`).

**USA-04 · Coda offline: voci ferme o scartate senza avviso**
`lib/offline.svelte.ts:52-74`: la coda riparte solo all'evento `online` o al login, quindi una voce fallita con rete presente ma server irraggiungibile resta ferma. Al reinvio, qualunque errore diverso da offline/5xx/401 (anche un 429, o uno slot archiviato nel frattempo) elimina la voce in silenzio. Se `localStorage` è pieno la voce non viene salvata affatto (`:25-31`) ma l'utente vede comunque «in coda». Vedi anche TOK-08 per i doppioni.

**USA-05 · I Preferiti non si possono usare dalla loro pagina, e nel form se ne vedono solo sei**
In `routes/favorites/+page.svelte:115-131` le righe non sono toccabili (solo swipe per eliminare), mentre il testo introduttivo promette «li reinserisci con un tocco». In `/add` compaiono solo i primi 6 (`routes/add/+page.svelte:204-209`). Il web non chiama mai `POST /favorites/:id/use` né `PATCH /favorites/:id`, che il server offre: il contatore resta «usato 0 volte», l'ordinamento per uso non funziona, un preferito non si può rinominare.

**USA-06 · Sessione scaduta: errore generico, nessun ritorno al login**
Il codice `unauthorized` non è gestito in `lib/state.svelte.ts:52-108` e nessuno azzera l'utente: dopo la scadenza ogni azione mostra «Qualcosa è andato storto. Riprova.» finché non si ricarica la pagina a mano.

### Media

**Passaggio tra schermate e stato perso**

- **USA-07 · «Indietro» dopo il salvataggio riapre il form.** `goto(back)` senza `replaceState` (`routes/add/+page.svelte:381,386,400,415`): il tasto indietro di Android riporta su un «Aggiungi pasto» vuoto o sulla voce appena eliminata.
- **USA-08 · Il form «Aggiungi» perde tutto senza avviso.** Lo stato è solo locale, senza bozza né `beforeNavigate`: X, logo, barra dei tab, ricarica o tocco su una notifica buttano via righe, foto e stime AI già pagate.
- **USA-09 · «Aggiungi al diario» dalla libreria scarta gli altri alimenti già scritti** (`routes/add/+page.svelte:434`): il prodotto viene registrato e si torna a Oggi.
- **USA-10 · La foto del piatto sostituisce tutte le righe senza conferma** (`routes/add/+page.svelte:285-287`); in modifica la voce esistente diventa il primo alimento riconosciuto.
- **USA-11 · Cambio giorno: data nuova sopra i pasti del giorno vecchio** su rete lenta o offline (`routes/+page.svelte:131-140`): `loadedDay` non viene svuotato, e i «+» puntano già alla data nuova.
- **USA-12 · I popup non rispondono al tasto indietro e non trattengono il focus** (`lib/CalendarPopup.svelte`, `lib/NewsPopup.svelte`): indietro cambia pagina invece di chiudere.
- **USA-13 · Il form di un alimento di libreria non è legato all'indirizzo** (`routes/favorites/+page.svelte:43-45`): indietro esce dall'intera pagina, la ricarica perde il form.

**Velocità**

- **USA-14 · «Aggiungi» resta su «Caricamento…» per 2-3 richieste in sequenza** (`routes/add/+page.svelte:86-125`): il campo di testo compare solo dopo preferiti e suggerimenti, che non servono per iniziare a scrivere.
- **USA-15 · Avvio: almeno 700 ms di splash, `/status` e `/me` in serie, 918 immagini nel reticolo** (`routes/+layout.svelte:20-58`, `lib/Splash.svelte`).
- **USA-16 · «Stima» su più alimenti va in sequenza, senza avanzamento né annullamento** (`routes/add/+page.svelte:246-253`); Salva resta disabilitato per tutta l'attesa, fino a 60 s per alimento.
- **USA-17 · Nessun indicatore dopo la scansione e durante la ricerca** (`lib/LibraryPicker.svelte:53-63,150-152`): compare «Nessun alimento trovato» prima che arrivi la risposta; nessuna protezione dalle risposte fuori ordine.
- **USA-18 · Service worker senza limite di attesa sulla rete** (`service-worker.ts:39-50`): la cache viene usata solo quando la richiesta fallisce. Con rete debole ma presente l'avvio può restare appeso (da verificare sul campo).
- **USA-19 · `/achievements` richiesto a ogni cambio pagina** (`lib/AchievementToast.svelte:22-42`).
- **USA-20 · Doppio invio possibile** su slot extra, «Stima le voci», salva preferito, nuovo slot, invito/utente, pesata: nessuno stato «occupato» (elenco: `routes/+page.svelte:170-178,227-237`, `routes/add/+page.svelte:185-202`, `routes/profile/slots/+page.svelte:72-83`, `routes/admin/+page.svelte:61-76`, `lib/WeightPanel.svelte:104-116`).

**Chiarezza dei dati**

- **USA-21 · «1.800» viene letto come 1,8 e un numero non valido diventa «vuoto» in silenzio** (`lib/foodRow.ts:45-50`, `routes/profile/thresholds/+page.svelte:22-27`, `lib/ProductForm.svelte:31-36`). Una soglia di 1.800 kcal viene salvata come 1,8 con conferma «Salvato». Nei limiti AI il caso è più serio: vedi TOK-15.
- **USA-22 · Le voci senza valori contano zero, e totali e medie non lo dicono** (`packages/shared/src/nutrients.ts:53-60`): giornata e «Media giornaliera» risultano sottostimate senza alcun segnale.
- **USA-23 · La giornata in corso è «Sotto il minimo» dalla colazione in poi** e in Andamento entra nella media e nei giorni fuori fascia (`routes/trends/+page.svelte:23-36`).
- **USA-24 · I grafici non lasciano leggere i valori** (`lib/BarChart.svelte`, `lib/WeightChart.svelte`): nessun valore al tocco, assi senza unità, tacche a terzi del picco. Con valori piccoli le tacche arrotondate si ripetono e sono usate come chiave dell'elenco (possibile errore a schermo, da verificare).
- **USA-25 · «Da dove arrivano le calorie» riusa i colori di stato** (`routes/trends/+page.svelte:56-58`): i grassi hanno l'arancio che nella legenda sopra significa «Sopra il massimo». Le percentuali possono sommare 99 o 101.

**Errori e riscontri**

- **USA-26 · Messaggio offline sbagliato per le letture**: aprendo un giorno senza rete, o con il server giù, compare «le modifiche non sono state salvate» anche se non si è modificato nulla (`lib/api.ts:22-24`).
- **USA-27 · Server in errore all'avvio: si finisce sul login** pur con sessione valida (`routes/+layout.svelte:28-34`).
- **USA-28 · Errori mostrati in cima alla pagina mentre l'utente è in fondo** (slot, preferiti, peso, Oggi, amministrazione); in `WeightPanel` l'errore non si cancella dopo un successo.
- **USA-29 · Scanner: un solo messaggio per permesso negato, fotocamera occupata e libreria non caricata** (`lib/BarcodeScanner.svelte:14-25`), senza indicazioni per riabilitare il permesso.
- **USA-30 · Limiti AI comunicati a metà.** Spesa e tetto arrivano dal server ma non vengono mostrati, quindi nessun preavviso; in Oggi, a limite raggiunto, il pulsante «Stima le voci» sparisce senza spiegazione; il budget dell'istanza esaurito mostra il testo del limite personale; il motivo di un calcolo fallito (`calcError`) non è mai mostrato.
- **USA-31 · Etichetta non caricata: il form resta in «crea» anche se il prodotto esiste già** (`lib/ProductForm.svelte:153-159`): un secondo Salva crea un doppione o dà «codice a barre già presente».

**Azioni distruttive**

- **USA-32 · Eliminazioni immediate senza conferma né annulla** per pesata, preferito, slot extra, disattivazione utente, cambio ruolo, revoca invito, scollegamento app: incoerente con le voci del diario, che l'annulla ce l'hanno.
- **USA-33 · Lo swipe sull'intestazione dello slot svuota tutto il pasto, con lo stesso cestino delle singole voci** (`routes/+page.svelte:388-396`). La stessa icona significa «svuota», «annulla salto» o «rimuovi slot» a seconda dello stato. Lo swipe non è spiegato in nessun punto dell'interfaccia.
- **USA-34 · Slot archiviati non ripristinabili**: il server lo permette, l'interfaccia no (`routes/profile/slots/+page.svelte`).
- **USA-35 · Riordinare gli slot cancella le modifiche non salvate delle altre schede** (`routes/profile/slots/+page.svelte:60-70`). Qui la spunta «Promemoria» richiede Salva, in Notifiche gli interruttori salvano subito.

**Account e primo avvio**

- **USA-36 · Nessun «password dimenticata»** (vedi SEC-04).
- **USA-37 · Primo avvio senza guida e con il popup «Novità»**: appena creato l'account compare il changelog; poi un diario senza soglie e senza indicazioni verso Soglie, calcolo AI o connettore.
- **USA-38 · I promemoria si attivano anche se il dispositivo non riceve notifiche**: nessun avviso né collegamento a Notifiche; dopo un logout l'iscrizione va riattivata a mano, senza segnalazione.
- **USA-39 · App mai chiusa: nessun controllo di versione dopo l'avvio** (`routes/+layout.svelte:35-48`). Da verificare: dopo un aggiornamento una pagina vecchia ancora aperta potrebbe non trovare più i file caricati su richiesta (scanner, rotte).

### Bassa

- **USA-40 · Bersagli di tocco sotto i 44 px**: «?» 28 px, «Salta» 32 px, «Saltato» 36 px, chip delle unità 40 px.
- **USA-41 · Chip a scorrimento orizzontale senza indizio** che ce ne siano altri oltre il bordo.
- **USA-42 · Nessun focus automatico sul primo alimento**: un tocco in più a ogni pasto.
- **USA-43 · Senza parametro lo slot proposto è sempre il primo** (colazione) a prescindere dall'ora; senza slot, Salva è disabilitato senza spiegazione.
- **USA-44 · Come si sblocca un traguardo è scritto solo in `title`**, invisibile su touch; la pagina è l'unica del profilo senza freccia indietro.
- **USA-45 · Freccia «Indietro» a destra** nella barra; a sinistra c'è il logo, che porta sempre a Oggi.
- **USA-46 · Il modulo pesata si apre sopra il calendario senza scorrere né prendere il focus**; i mesi futuri si sfogliano senza limite.
- **USA-47 · Calendario e frecce giorno hanno limiti diversi**: il calendario blocca il futuro, le frecce no.
- **USA-48 · Spunte che restano attive dopo un errore** (amministrazione, notifiche).
- **USA-49 · Piccole incoerenze nei form**: fascia di silenzio con un solo orario azzera entrambi e dice «Salvato»; «Salvato» resta mentre si modifica; la foto di una voce non si può togliere; cambiando data nel form non si ricaricano gli slot extra.
- **USA-50 · Traduzioni**: «Splash page» e «OK» scritti nel codice; nessun plurale («usato 1 volte», «1 richieste»); 11 chiavi inutilizzate; manifest solo in italiano.
- **USA-51 · Logout offline non effettivo**: il cookie resta valido e al ritorno della rete l'utente è di nuovo dentro. La cache delle API non viene mai sfoltita.

---

## 3. Consumi token e rispetto dei limiti

Mealler chiama l'API Anthropic in tre punti, tutti in `apps/server/src/ai.ts`: stima di un pasto (`estimateMeal`, da `/api/ai/estimate` e dal lavoro in background sulle voci «in attesa»), lettura di un'etichetta (`readNutritionLabel`, da `/api/products/label`) e prova della chiave (`testApiKey`). Il connettore claude.ai (`mcp.ts`) **non** consuma token dell'amministratore: le stime le fa Claude dal lato dell'utente.

I prezzi in `ai.ts:27-31` (Haiku 5.5 $0,10/$0,50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per milione di token) corrispondono al listino attuale. I token di ragionamento sono compresi in `output_tokens`, quindi vengono contati.

### Cosa è fatto bene

- Cinque limiti indipendenti: tetto mensile per utente, budget mensile dell'istanza, richieste al giorno, token al giorno, richieste al minuto (`ai.ts:189-199`).
- Il conteggio delle richieste giornaliere avviene *prima* della chiamata e in modo sincrono: quel limite non si supera con richieste in parallelo.
- Nessun ciclo automatico costoso: una chiamata fallita con risposta di Anthropic viene registrata e la voce torna «manuale» (`ai.ts:586-590`); il client non ritenta da solo; si usa `fetch` diretto, senza i ritentativi automatici dell'SDK.
- Le foto vengono ridotte a 1280 px sul dispositivo prima dell'invio (`apps/web/src/lib/image.ts`).
- I test coprono tetto mensile e limite giornaliero (`test/api.test.ts:468-600`).

### Quanto può costare una singola chiamata

`max_tokens: 8000` per ogni stima e ogni etichetta (`ai.ts:388`, `ai.ts:479`), su qualunque modello. Il caso peggiore di una chiamata è quindi circa $0,004 con Haiku, $0,08 con Sonnet, $0,16 con Opus, più l'ingresso (trascurabile). Con i default (40 richieste al giorno, foto su Sonnet) il caso peggiore teorico è intorno a **$3 al giorno per utente**, cioè ~$95 al mese per utente; il consumo reale sarà molto più basso, ma è questo il numero contro cui dimensionare i tetti.

### Alta

**TOK-01 · Di default non c'è alcun tetto in dollari**
`readAiSettings` (`ai.ts:99-103`) lascia `monthlyCapUsd` e `instanceMonthlyUsd` a `null` finché l'amministratore non li compila: valgono solo 40 richieste/giorno e 6/minuto *per utente*. La spesa massima cresce quindi con il numero di utenti, e con la registrazione libera aperta chiunque si iscriva porta con sé la propria quota giornaliera.
*Direzione*: budget mensile dell'istanza obbligatorio (o con un default prudente) per poter attivare l'AI; avviso in amministrazione se AI attiva + registrazione aperta + nessun budget.

**TOK-02 · I tetti in dollari e il limite di token si controllano «a consuntivo»**
`checkLimits` (`ai.ts:190-196`) confronta la spesa *già registrata* con il tetto; la spesa viene registrata solo a risposta arrivata (`ai.ts:395`). Tutte le richieste partite prima che la prima finisca passano il controllo. Con il limite al minuto impostato lo sforamento è contenuto (al massimo le richieste in corso: ~6 × costo massimo per utente); ma l'amministratore può mettere «nessun limite» sia al minuto sia al giorno (`ai.ts:116-118`) e affidarsi al solo tetto in dollari: in quel caso un utente può lanciare decine di richieste insieme e superare il tetto di molte volte. Lo stesso vale per il budget dell'istanza con più utenti attivi nello stesso momento.
*Direzione*: prenotare il costo massimo della chiamata prima di farla (spesa registrata + chiamate in corso × costo massimo ≥ tetto → rifiuto) e conguagliare alla risposta; in ogni caso non permettere di togliere insieme limite al minuto e limite giornaliero.

**TOK-03 · Le chiamate non concluse non vengono contate**
Se la chiamata supera i 60 secondi (`ai.ts:57`) o la connessione cade, `callApi` lancia `aiFailed` (`ai.ts:338-341`) senza registrare alcun costo. Anthropic può comunque aver elaborato e fatturato la richiesta (da verificare sul comportamento di fatturazione delle richieste interrotte; va assunto il caso peggiore). Con 8000 token di uscita e ragionamento sempre attivo su Sonnet/Opus, i 60 secondi sono un margine da misurare. L'utente vede «Il calcolo non è riuscito. Riprova» e riprova: ogni tentativo è spesa reale invisibile ai tetti di Mealler.
*Direzione*: in caso di timeout o errore di rete registrare il costo massimo presunto della chiamata (o almeno un costo forfettario) e mostrarlo come «non confermato»; alzare il timeout o passare allo streaming; abbassare `max_tokens`.

**TOK-04 · Cancellare l'account cancella la spesa registrata**
`ai_usage` e `ai_usage_daily` hanno `ON DELETE CASCADE` sull'utente (`migrations/0004_ai_estimates.sql:18`, `0005_ai_limits.sql:5`) e `DELETE /api/me` chiede solo la password (`routes/auth.ts:136`). Conseguenze: (a) il budget mensile dell'istanza, calcolato come somma di `ai_usage` (`ai.ts:166-174`), *scende* quando un utente si cancella, quindi la spesa reale del mese può superare il budget; (b) con la registrazione aperta (o un invito a disposizione) un utente azzera tetto mensile e limite giornaliero cancellando e ricreando l'account; (c) l'amministratore perde lo storico di spesa di quell'utente.
*Direzione*: tenere un registro di spesa dell'istanza che non dipende dall'utente (utente a `NULL` alla cancellazione) e calcolare il budget dell'istanza su quello.

### Media

**TOK-05 · Il limite giornaliero si aggira cambiando fuso orario**
Il contatore giornaliero è indicizzato sul giorno *nel fuso dell'utente* (`ai.ts:151,158`), e il fuso si cambia liberamente con `PATCH /api/me` (`routes/auth.ts:113`). Passando a un fuso dove è già «domani» o ancora «ieri» si ottiene un contatore nuovo: fino a due o tre volte il limite giornaliero. Lo stesso vale per il tetto mensile a cavallo di fine mese (`monthOf`, `ai.ts:145`).
*Direzione*: contare su una finestra mobile di 24 ore, o su giorno/mese UTC dell'istanza.

**TOK-06 · Il budget dell'istanza usa il mese UTC, la spesa è registrata nel mese locale dell'utente**
`instanceSpentThisMonth` filtra sul mese UTC (`ai.ts:167`), `recordUsage` scrive il mese nel fuso dell'utente (`ai.ts:234`). Nelle ore di differenza a cavallo del cambio mese la spesa finisce in un mese e il controllo guarda l'altro: il budget dell'istanza risulta vuoto o già speso a seconda dei casi.

**TOK-07 · Il lavoro in background ritenta all'infinito e blocca la coda**
`processPendingEntries` (`ai.ts:560-594`) prende 5 voci «in attesa» senza ordinamento ogni 15 secondi. Con `aiBusy` (429/529 di Anthropic) o `aiTooFast` la voce resta in attesa e viene ripresa al giro successivo, senza numero massimo di tentativi né attesa crescente. Ogni tentativo `aiBusy` consuma una richiesta dal limite giornaliero dell'utente (il conteggio avviene prima della chiamata, `ai.ts:198`): un'ora di sovraccarico di Anthropic brucia la quota giornaliera senza produrre nulla. Se il limite giornaliero è «nessuno», il ciclo non termina mai, tiene occupati i 5 posti e le voci degli altri utenti non vengono mai elaborate. Le chiamate rifiutate con 429 non costano token, ma prolungano il blocco. Vengono inoltre elaborate anche le voci di utenti disattivati.
*Direzione*: contatore di tentativi sulla voce, attesa crescente, ordinamento per anzianità con equità tra utenti, restituzione della richiesta giornaliera quando Anthropic risponde 429/529, salto degli utenti non attivi.

**TOK-08 · La coda offline può creare doppioni, ognuno con il suo calcolo**
`flushQueue` (`apps/web/src/lib/offline.svelte.ts:53-72`) reinvia `POST /api/entries` quando la rete torna. Se la richiesta arriva al server ma la risposta si perde, la voce resta in coda e viene inviata di nuovo: voce doppia nel diario e, con `calculate: true`, doppia chiamata all'API. L'identificativo generato per la coda non viene inviato al server, che non ha modo di riconoscere il doppione.
*Direzione*: chiave di idempotenza inviata dal client e ricordata dal server.

**TOK-09 · `max_tokens` e sforzo uguali per ogni tipo di richiesta**
8000 token e `effort: 'medium'` valgono sia per «una mela» su Haiku sia per una foto su Opus. È il parametro che fissa il costo massimo di ogni chiamata (e quindi lo sforamento possibile in TOK-02 e TOK-03). Non viene controllato `stop_reason`: una risposta troncata a `max_tokens` o rifiutata viene pagata, fallisce la validazione e l'utente vede un errore generico che invita a riprovare.
*Direzione*: valori per tipo di richiesta (testo breve più bassi), sforzo basso per il testo, gestione esplicita di `max_tokens` e `refusal` con un messaggio che non inviti a ripetere la stessa richiesta.

**TOK-10 · Listino scritto nel codice, con costo zero se manca il modello**
`recordUsage` usa `PRICES[model] ?? { input: 0, output: 0 }` (`ai.ts:231`): un modello aggiunto all'elenco senza prezzo verrebbe contato a $0 e nessun tetto scatterebbe. Un cambio di listino di Anthropic richiede una nuova release di Mealler; fino ad allora i tetti in dollari lavorano su cifre sbagliate. Haiku 5.5 ha inoltre un prezzo più alto oltre i 100 000 token di prompt (non raggiungibile oggi, ma non gestito).
*Direzione*: errore anziché zero per un modello senza prezzo; prezzi modificabili dall'amministrazione; nella pagina dei consumi mostrare i token oltre ai dollari, così il confronto con la console Anthropic è diretto.

**TOK-15 · Un valore scritto male nei limiti AI li toglie senza errore**
In `apps/web/src/lib/AiAdmin.svelte:67-71` un campo non numerico («5$», «10 usd») diventa `null`, che per il server significa «nessun limite» (`ai.ts:139`). L'amministratore crede di aver messo un tetto, vede la conferma, e il tetto non c'è. «1.000» viene invece letto come 1.
*Direzione*: rifiutare il valore con un errore sul campo; «nessun limite» solo come scelta esplicita.

### Bassa

- **TOK-11 · Nessun avviso all'avvicinarsi del budget.** L'amministratore scopre che il budget è finito quando gli utenti vedono l'errore. Manca una soglia di preavviso (es. 80%) con notifica.
- **TOK-12 · Nessun registro delle singole chiamate.** `ai_usage` è un totale per utente/mese/modello: non si può ricostruire quando e perché è stata fatta una spesa, né riconciliarla con la fattura. Le chiamate fallite compaiono solo nei log del container (`console.error`, fuori dal logger strutturato).
- **TOK-13 · `testApiKey` non è contata** (`ai.ts:520-534`): 5 token a prova, solo amministratore, 10 al minuto. Irrilevante come costo, ma è una chiamata fuori contabilità.
- **TOK-14 · «Calcola la giornata» rimette in coda tutto.** `POST /api/day/:date/calculate` (`routes/insights.ts:148`) non ha limite di frequenza e rimette in attesa ogni voce senza valori, comprese quelle appena fallite. I limiti per utente contengono la spesa, ma è il punto dove un calcolo che fallisce sempre viene ripagato a ogni tocco.

---

## 4. Ordine di lavoro consigliato

1. **Mettere in sicurezza la spesa**: TOK-01 (budget obbligatorio), TOK-02 (prenotazione del costo), TOK-04 (registro di spesa indipendente dall'utente), TOK-03 (chiamate non concluse).
2. **Chiudere l'accesso dall'esterno**: SEC-01 (`trustProxy` + blocco per account), SEC-02 (porta), SEC-08 (variabili nel compose).
3. **Rendere l'istanza recuperabile e riproducibile**: SEC-04 (recupero password), SEC-03 (lockfile), SEC-09 (permessi dei backup).
4. **Stabilità del calcolo in background**: TOK-07, TOK-08, TOK-05/06.
5. **Usabilità, uso quotidiano**: USA-01 e USA-02 (data e dati aggiornati al ritorno nell'app), USA-04 (coda offline), USA-06 (sessione scaduta), poi USA-03 e USA-05 (codice a barre e preferiti).
6. **Usabilità, perdita di lavoro**: USA-07/08/09/10 (form «Aggiungi»), USA-21 con TOK-15 (numeri), USA-32/33 (eliminazioni).
7. **Rifiniture**: SEC-05/06/07/11/12, TOK-09/10, il resto della sezione 2 e le voci di gravità bassa.

---

## 5. Stato delle correzioni

Situazione all'11 novembre 2026, sul ramo `audit-fixes` (sei commit dopo questo documento, non ancora rilasciati).

Come sono state verificate: le voci di sicurezza e sui token sono state rilette una per una sul codice del server prima di toccarlo, e nessuna è risultata infondata. Le correzioni del server hanno test automatici (17 test, tutti verdi) e l'immagine Docker è stata compilata e avviata con lo smoke test della CI. Le correzioni dell'interfaccia superano il controllo dei tipi e la compilazione, ma **non sono state provate in un browser né su un telefono**: vanno provate a mano prima del rilascio.

| Area | Risolte | In parte | Aperte |
| --- | --- | --- | --- |
| Sicurezza (21) | 10 | 4 | 7 |
| Usabilità (51) | 21 | 1 | 29 |
| Token e limiti (15) | 11 | 1 | 3 |

### Sicurezza

| Voce | Stato | Note |
| --- | --- | --- |
| SEC-01 | Risolta | `MEALLER_TRUST_PROXY` elenca gli indirizzi dei proxy fidati (default: privati e locali), più il blocco per account dopo 5 accessi falliti. Non il conteggio degli hop proposto sopra: la versione di Fastify in uso lo ignora di proposito, perché non distingue un proxy da un client diretto. Resta vero che chi raggiunge la porta direttamente da una rete privata può ancora falsificare `X-Forwarded-For`: per questo c'è `MEALLER_BIND`, e `MEALLER_TRUST_PROXY=none` per chi non usa proxy. |
| SEC-02 | Risolta | `MEALLER_BIND=127.0.0.1`, passo obbligato nella guida. Il default resta `0.0.0.0` perché l'uso in rete locale senza proxy ne ha bisogno. |
| SEC-03 | In parte | `--frozen-lockfile` in immagine e CI, dipendenze di produzione dal lockfile (`pnpm deploy`). Non fatto: immagine base e action fissate a un digest, tag di versione al posto di `latest` nel compose (lo script di aggiornamento conta su `latest`). |
| SEC-04 | Risolta | Link monouso dall'amministrazione e comando `reset-password`. |
| SEC-05 | Risolta | Il cambio password revoca i token OAuth; un refresh token riusato chiude il collegamento. |
| SEC-06 | Risolta | Accettati solo gli host dei servizi push dei browser. |
| SEC-07 | Aperta | Cancellare i client senza token rischia di rompere la riconnessione di claude.ai, che riusa il proprio `client_id`: serve prima sapere come si comporta. Schermata di consenso non toccata. |
| SEC-08 | Risolta | |
| SEC-09 | Risolta | |
| SEC-10 | Aperta | Scelta dichiarata. Con SEC-08 `MEALLER_SECRET_KEY` ora funziona davvero; la chiave privata VAPID resta in chiaro nel database. |
| SEC-11 | Risolta | Form accettati solo dagli endpoint OAuth; modifiche rifiutate se `Sec-Fetch-Site` è `cross-site` o `same-site`. |
| SEC-12 | In parte | Limiti di frequenza su prodotti, etichette e `/mcp`; foto senza voce cancellate dopo un giorno. Non fatto: quota per utente. |
| SEC-13 | In parte | Il login impiega lo stesso tempo per indirizzi esistenti e non. `/api/register` risponde ancora `emailTaken`. |
| SEC-14 | Risolta | |
| SEC-15, 16, 17, 18, 20 | Aperte | SEC-17: la versione serve all'app prima del login per aggiornarsi. |
| SEC-19 | In parte | `cap_drop: ALL` e `no-new-privileges`. Non fatto: `read_only`, limiti di memoria. |
| SEC-21 | Risolta | Il percorso delle foto è ricostruito dalla cartella dati. |

### Usabilità

Risolte: USA-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 14, 17, 20, 21, 26, 27, 32, 34, 36, 43.

- USA-03: il codice a barre viene ancora cercato due volte (una dalla schermata del pasto, una dalla libreria).
- USA-08: la bozza vale per i pasti nuovi, non per le modifiche a una voce esistente, e non conserva l'anteprima della foto.
- USA-32: conferma con finestra di dialogo, non «Annulla» come nel diario.

In parte: USA-30 (il diario ora spiega perché «Stima le voci» non c'è; spesa e tetto restano non mostrati, e il budget dell'istanza esaurito usa ancora il testo del limite personale nel form).

Aperte: USA-12, 13, 15, 16, 18, 19, 22, 23, 24, 25, 28, 29, 31, 33, 35, 37, 38, 39 e tutte le voci di gravità bassa da USA-40 a USA-51 tranne USA-43. Sono in gran parte scelte di interfaccia (grafici, primo avvio, gesti) che conviene decidere guardando l'app, non il codice.

### Token e limiti

| Voce | Stato | Note |
| --- | --- | --- |
| TOK-01 | Risolta | Budget dell'istanza di 10 $ al mese finché non se ne sceglie uno, e avviso in amministrazione se manca. Un'istanza che aveva già salvato il modulo con il campo vuoto resta senza tetto: vede l'avviso. |
| TOK-02 | Risolta | Il caso peggiore delle chiamate in corso conta nei tetti. Resta possibile togliere insieme limite al minuto e limite giornaliero. |
| TOK-03 | Risolta | Un timeout è registrato al costo massimo della chiamata. Che Anthropic fatturi davvero le richieste interrotte resta da verificare; non c'è distinzione a schermo tra spesa confermata e presunta. |
| TOK-04 | Risolta | Tabella `ai_spend` indipendente dagli utenti. Con la registrazione aperta un nuovo account ha comunque limiti personali nuovi: lì il controllo è il budget dell'istanza. |
| TOK-05, 06 | Risolte | Giorni e mesi in UTC per tutti i contatori. |
| TOK-07 | Risolta | Ordine per anzianità, attesa crescente, 8 tentativi al massimo, richiesta restituita su 429/529, utenti non attivi saltati. |
| TOK-08 | Risolta | Chiave scelta dal dispositivo, unica per utente. |
| TOK-09 | Risolta | Testo: 4000 token e sforzo basso; foto: 8000 e medio. Lo sforzo basso sul testo non è stato misurato su stime reali: se la qualità cala, è una riga in `ai.ts`. |
| TOK-10 | In parte | Un modello senza prezzo è un errore. I prezzi restano nel codice e la soglia dei 100 000 token di Haiku non è gestita. |
| TOK-11, 12, 13 | Aperte | |
| TOK-14 | Risolta | |
| TOK-15 | Risolta | |

