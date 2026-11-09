# Changelog

Tutte le modifiche rilevanti di Mealler sono annotate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [Non rilasciato]

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
