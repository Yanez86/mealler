# Changelog

Tutte le modifiche rilevanti di Mealler sono annotate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [Non rilasciato]

## [0.4.1] - 2026-11-09

### Aggiunto
- Limiti al calcolo con Claude, configurabili in Amministrazione: richieste al giorno per utente (40 di default), richieste al minuto per utente (6 di default), token al giorno per utente e budget mensile complessivo dell'istanza.
- Ogni tentativo viene conteggiato prima della chiamata all'API, così gli errori ripetuti non aggirano i limiti.
- Nella schermata Aggiungi pasto il contatore dei calcoli usati oggi e un avviso chiaro quando un limite è raggiunto.

## [0.4.0] - 2026-11-09

### Aggiunto
- Calcolo con Claude dentro l'app (API Anthropic): pulsante "Calcola con Claude" e stima da foto, con dettaglio per alimento, livello di affidabilità e valori modificabili prima di salvare.
- Foto ridotte sul telefono prima dell'invio (massimo 1280 px); l'amministratore sceglie se conservarle.
- Salvataggio senza attese: una voce senza valori viene registrata subito e calcolata in background; il diario si aggiorna da solo.
- Pannello in Amministrazione: chiave API (cifrata sul server con AES-256-GCM), modelli per testo e foto, tetto di spesa mensile per utente, verifica della chiave, consumi del mese per utente.
- Contatore di token e costo stimato per utente e per modello.

## [0.3.0] - 2026-11-09

### Aggiunto
- Connettore per claude.ai: endpoint MCP `/mcp` con gli strumenti `list_slots`, `get_day`, `add_entry`, `update_entry`, `delete_entry`, `get_thresholds` e `get_summary`. Claude stima porzioni e valori e li registra nel diario con il dettaglio per alimento.
- Server di autorizzazione OAuth 2.1 integrato: discovery, registrazione dinamica dei client, PKCE S256 obbligatorio, token che si rinnovano e revoca.
- Schermata di consenso, pagina Connettore claude.ai con le istruzioni e l'elenco delle app collegate, revocabili.
- Interruttore in Amministrazione per attivare il connettore (disattivato di default).
- Le voci registrate da Claude sono segnate come "Stima Claude" nel diario.
- Splash all'avvio con logo e versione; se l'app sul dispositivo è più vecchia del server si aggiorna da sola.
- Avviso agli amministratori quando su GitHub c'è una versione più recente (disattivabile con `MEALLER_UPDATE_CHECK=false`).

### Modificato
- Dopo il login si torna alla pagina richiesta (per esempio la schermata di consenso).

## [0.2.0] - 2026-11-09

### Aggiunto
- Promemoria push per gli slot ancora vuoti, con ritardo configurabile per slot (da subito a 2 ore dopo l'orario).
- Pagina Notifiche: attivazione per dispositivo, notifica di prova, fascia di silenzio, pausa di 7 giorni.
- Avvisi dedicati quando le notifiche non sono disponibili: connessione senza HTTPS, iPhone senza app installata, permesso negato.
- Consultazione offline del diario e degli slot dall'ultima versione salvata.
- Inserimenti fatti offline salvati sul dispositivo e inviati automaticamente al ritorno della rete.
- Chiavi VAPID generate al primo avvio.

### Modificato
- All'uscita dall'account il dispositivo smette di ricevere i promemoria e la cache locale viene svuotata.

## [0.1.0] - 2026-11-09

### Aggiunto
- Primo avvio guidato: chi installa l'istanza crea l'account amministratore.
- Accesso con email e password (argon2id), sessioni tramite cookie HttpOnly, limite ai tentativi.
- Gestione utenti per l'amministratore: creazione, ruoli, disattivazione, inviti con scadenza, registrazione libera opzionale.
- Slot dei pasti per utente, con orario, giorni della settimana e ordine; cinque slot di partenza nella lingua dell'utente.
- Diario giornaliero con inserimento manuale di calorie, proteine, carboidrati, grassi e fibre, e controllo di coerenza tra calorie e macronutrienti.
- Soglie minime e massime facoltative per ogni nutriente, versionate per data.
- Interfaccia mobile-first in italiano e inglese, tema chiaro e scuro, logo sempre in alto a sinistra come link a Oggi.
- PWA installabile con cache dell'interfaccia.
- Immagine Docker e `docker-compose.yml`, con migrazioni automatiche del database SQLite.
