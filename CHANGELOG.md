# Changelog

Tutte le modifiche rilevanti di Mealler sono annotate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [Non rilasciato]

### Aggiunto
- Icone colorate per 16 categorie di alimenti, disegnate nello stile del logo: frutta, verdura, legumi, pane e cereali, pasta e riso, pizza, carne e salumi, pesce, uova, latte e formaggi, frutta secca, grassi e condimenti, dolci, caffè e tè, bevande, alcolici.
- La categoria è riconosciuta in automatico dal nome del cibo, in italiano e in inglese (se il nome non basta, conta l'alimento più calorico della stima AI); l'icona compare nel diario, nei preferiti, nella libreria alimenti e nella schermata Aggiungi pasto.

## [0.6.0] - 2026-11-09

### Aggiunto
- Libreria alimenti condivisa tra gli utenti dell'istanza: prodotti confezionati con valori per 100 g e porzione tipica, nella scheda Preferiti → Alimenti.
- Quattro modi per aggiungere un prodotto: inserimento manuale, scansione del codice a barre (con ricerca su Open Food Facts se non è già in libreria), foto della tabella nutrizionale letta dall'AI.
- Nella schermata Aggiungi pasto: ricerca o scansione di un prodotto della libreria, quantità in grammi o porzioni, valori calcolati dalla confezione senza consumare calcoli AI.
- Strumenti del connettore claude.ai search_foods e log_food: Claude usa i valori esatti dei prodotti in libreria.
- Pulsante "Usa i valori consigliati (LARN)" nelle soglie: carboidrati 45–60% e grassi 20–35% delle calorie, proteine 0,9 g/kg, fibre almeno 25 g.
- Interruttore in Amministrazione per la ricerca su Open Food Facts.

## [0.5.2] - 2026-11-09

### Modificato
- Vista del giorno: nomi dei nutrienti e soglie restano su una riga e vengono troncati invece di andare a capo.
- Le voci stimate sono etichettate "Stima AI".
- Se le calorie hanno sia un minimo sia un massimo, il riepilogo mostra l'intervallo.

## [0.5.1] - 2026-11-09

### Modificato
- Nella schermata del pasto i valori nutrizionali sono in una sezione a tendina, chiusa di default, con il riepilogo dei totali sempre visibile.
- La data in alto è in formato breve (es. "lun 9 nov") e resta sempre su una riga.

## [0.5.0] - 2026-11-09

### Aggiunto
- Preferiti: salva un pasto con i suoi valori e reinseriscilo con un tocco; nella schermata Aggiungi pasto compaiono i preferiti e i pasti mangiati più spesso.
- Andamento: grafici a barre di calorie e macronutrienti su 7, 30 o 90 giorni con le soglie disegnate come fascia, media giornaliera, giorni nella fascia e ripartizione delle calorie tra proteine, carboidrati e grassi.
- Peso: ultima pesata con variazione, calendario mensile delle pesate, grafico nel tempo e promemoria ogni N settimane nel giorno e all'ora scelti.
- Strumenti del connettore claude.ai per il peso: log_weight e get_weights.
- Export dei dati: CSV dei pasti per periodo e JSON completo dell'account.
- Pagina Novità con questo changelog e avviso dopo ogni aggiornamento.
- Pulsante per calcolare con Claude, in un colpo, tutte le voci di una giornata ancora senza valori.
- Barra di navigazione con quattro sezioni: Oggi, Andamento, Preferiti, Profilo.

### Corretto
- Su iPhone il campo Data usciva dal bordo dello schermo e faceva scorrere la pagina in orizzontale.
- Quando il calcolo con Claude è spento, il messaggio ora lo dice chiaramente invece di parlare di versioni future.

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
