# Sicurezza

## Versioni supportate

Correzioni di sicurezza solo per l'ultima versione `1.x`. Aggiorna sempre all'ultima release (vedi [docs/INSTALL.md](docs/INSTALL.md#6-aggiornamenti)).

## Segnalare una vulnerabilità

Non aprire una issue pubblica. Usa **Security → Report a vulnerability** del repository GitHub (segnalazione privata). Indica versione, passi per riprodurre e impatto. Riceverai una risposta entro 7 giorni.

## Come Mealler protegge i dati

- **Password** salvate con Argon2id; limiti di tentativi su login, registrazione e cambio password.
- **Sessioni** con token casuali salvati solo come hash; cookie `HttpOnly`, `SameSite=Lax`, `Secure` in HTTPS.
- **Isolamento**: ogni richiesta del diario è filtrata sull'utente; nemmeno l'amministratore legge i diari degli altri.
- **Intestazioni HTTP**: Content-Security-Policy restrittiva (solo script dell'app, con hash degli script inline), `frame-ancestors 'none'`, `X-Frame-Options`, `Permissions-Policy` (fotocamera solo per l'app, niente microfono e posizione), `Referrer-Policy`, HSTS in HTTPS.
- **Connettore claude.ai**: OAuth 2.1 con PKCE S256, consenso esplicito, refresh token a rotazione, revoca dal profilo; disattivato finché un amministratore non lo accende.
- **Chiave API Anthropic** cifrata nel database con AES-256-GCM; la chiave di cifratura sta in `secret.key` o in `MEALLER_SECRET_KEY`, mai nel database. Non viene mai mostrata agli utenti.
- **Limiti di spesa AI** per utente e per istanza.
- **Cancellazione dell'account** dal profilo: elimina diario, foto, pesi, preferiti, soglie, notifiche e accessi del connettore.
- **Nessun dato esce dal server**, tranne: le richieste all'API Anthropic se l'amministratore la configura, la ricerca del codice a barre su Open Food Facts (solo il codice, disattivabile), il controllo della versione su GitHub (disattivabile) e le notifiche push tramite il servizio push del browser (contenuto cifrato).

## Consigli per chi installa

- Esponi Mealler solo in HTTPS e imposta `MEALLER_BASE_URL`.
- Tieni riservati `.env` (token del tunnel) e `secret.key`; includili nei backup e conservali al sicuro.
- Lascia chiusa la registrazione libera e usa gli inviti.
- Aggiorna regolarmente.
