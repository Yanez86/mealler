# Changelog

Tutte le modifiche rilevanti di Mealler sono annotate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [Non rilasciato]

### Corretto
- Aggiustata di nuovo l'intestazione su iPhone: la parte alta del titolo restava un po' sfocata.

## [1.1.1] - 2026-11-09

### Aggiunto
- Una X per chiudere l'avviso delle novità senza aprirle.

### Corretto
- Aggiustata l'intestazione su iPhone, che finiva sotto la sfocatura della barra di stato.

## [1.1.0] - 2026-11-09

### Aggiunto
- Icone colorate per 16 categorie di alimenti, nello stile del logo.
- La categoria si riconosce dal nome del cibo e l'icona compare nel diario, nei preferiti, nella libreria e in Aggiungi pasto.
- Categoria scelta a mano nel pasto o nella scheda di un alimento; i pasti da preferiti e libreria la ereditano.
- Aggiornati il connettore claude.ai e l'export con la categoria.

## [1.0.0] - 2026-11-09

Prima versione stabile.

### Aggiunto
- Eliminazione del proprio account dal Profilo, con conferma della password.
- Inserita una guida d'installazione completa.
- Inserite le istruzioni per segnalare problemi di sicurezza.
- Sistemata la pubblicazione delle versioni.

### Sicurezza
- Rafforzata la protezione delle pagine dell'app.
- La fotocamera è usata solo per codici a barre e foto; microfono e posizione sono disattivati.

## [0.6.0] - 2026-11-09

### Aggiunto
- Libreria alimenti condivisa con gli altri utenti, in Preferiti → Alimenti.
- Prodotti aggiunti a mano, con il codice a barre o dalla foto della tabella nutrizionale.
- In Aggiungi pasto i prodotti della libreria si inseriscono in grammi o porzioni, senza consumare calcoli AI.
- Aggiornato il connettore claude.ai per usare i valori della libreria.
- Pulsante per usare le soglie consigliate (LARN).
- Interruttore in Amministrazione per la ricerca su Open Food Facts.

## [0.5.2] - 2026-11-09

### Modificato
- Nella vista del giorno nutrienti e soglie restano su una riga.
- Le voci stimate sono etichettate "Stima AI".
- Il riepilogo mostra l'intervallo delle calorie quando ci sono minimo e massimo.

## [0.5.1] - 2026-11-09

### Modificato
- I valori nutrizionali del pasto sono in una sezione a tendina, con i totali sempre visibili.
- La data in alto è in formato breve.

## [0.5.0] - 2026-11-09

### Aggiunto
- Preferiti: un pasto salvato si reinserisce con un tocco; in Aggiungi pasto compaiono anche i più frequenti.
- Andamento: grafici di calorie e macronutrienti su 7, 30 o 90 giorni, con soglie e medie.
- Peso: ultima pesata, calendario, grafico e promemoria periodico.
- Aggiornato il connettore claude.ai con il peso.
- Export dei pasti e dell'intero account.
- Pagina Novità e avviso dopo ogni aggiornamento.
- Calcolo con Claude di tutte le voci di una giornata in un colpo.
- Barra di navigazione con Oggi, Andamento, Preferiti e Profilo.

### Corretto
- Aggiustato il campo Data su iPhone.
- Messaggio più chiaro quando il calcolo con Claude è spento.

## [0.4.1] - 2026-11-09

### Aggiunto
- Limiti al calcolo con Claude, configurabili in Amministrazione.
- Contatore dei calcoli usati oggi e avviso quando un limite è raggiunto.
- Migliorato il conteggio delle richieste.

## [0.4.0] - 2026-11-09

### Aggiunto
- Calcolo con Claude dentro l'app, da testo o da foto, con valori modificabili prima di salvare.
- Le voci si salvano subito e vengono calcolate in background.
- Ottimizzato l'invio delle foto; l'amministratore sceglie se conservarle.
- Pannello in Amministrazione per chiave API, modelli, spesa e consumi.
- Protetta la chiave API sul server.

## [0.3.0] - 2026-11-09

### Aggiunto
- Connettore per claude.ai: Claude stima porzioni e valori e li registra nel diario.
- Inserito l'accesso sicuro per le app collegate, con consenso e revoca.
- Interruttore in Amministrazione per il connettore, spento di default.
- Le voci registrate da Claude sono segnate "Stima Claude".
- Schermata d'avvio; l'app si aggiorna da sola quando serve.
- Avviso agli amministratori quando esce una nuova versione.

### Modificato
- Dopo il login si torna alla pagina richiesta.

## [0.2.0] - 2026-11-09

### Aggiunto
- Promemoria per i pasti non ancora segnati.
- Pagina Notifiche: attivazione per dispositivo, prova, fascia di silenzio e pausa.
- Avvisi chiari quando le notifiche non sono disponibili.
- Diario consultabile offline; gli inserimenti fatti offline partono al ritorno della rete.
- Configurate in automatico le notifiche al primo avvio.

### Modificato
- Uscendo dall'account il dispositivo smette di ricevere promemoria e i dati locali vengono cancellati.

## [0.1.0] - 2026-11-09

### Aggiunto
- Primo avvio guidato con la creazione dell'amministratore.
- Accesso con email e password.
- Protetti password e sessioni.
- Gestione utenti per l'amministratore, con inviti e registrazione libera opzionale.
- Slot dei pasti personali, con orario e giorni.
- Diario giornaliero con calorie, proteine, carboidrati, grassi e fibre.
- Soglie minime e massime facoltative per ogni nutriente.
- Interfaccia in italiano e inglese, tema chiaro e scuro.
- App installabile sul telefono.
- Inserita l'installazione con Docker.
