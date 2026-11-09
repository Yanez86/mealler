# Changelog

Tutte le modifiche rilevanti di Mealler sono annotate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [1.2.1] - 2026-11-09

### Modificato
- Nuova schermata di avvio: dietro il logo c'è un reticolo inclinato con le icone di tutte le categorie di alimenti, che sfuma verso il basso. In fondo, la coscia di pollo che gira durante il caricamento, la versione e la firma Happy Squid inc.

## [1.2.0] - 2026-11-09

### Aggiunto
- Toccando la data in alto si apre il calendario del mese: oggi cerchiato, in verde i giorni completi, con un puntino quelli iniziati. Un tocco porta a quel giorno.
- Il pulsante «Salta» negli slot da compilare segna un pasto come saltato: conta come compilato e non manda il promemoria. Si annulla toccando «Saltato».
- «Aggiungi slot» in fondo ai pasti aggiunge uno slot solo per quel giorno, per esempio un aperitivo.
- Le novità dopo un aggiornamento compaiono in un popup, che si chiude con la X o scorrendolo verso sinistra.
- Animazioni tra le pagine e al cambio di giorno.
- Lo script `aggiorna.sh` per il NAS: mostra i commit nuovi e le novità, chiede conferma, ricompila, fa un backup dei dati e riavvia Mealler.

### Modificato
- Scorrendo uno slot o una voce compare solo il cestino rosso, con un po' di spazio.
- Durante una stima compare «Sto stimando…» con una coscia di pollo che gira.

### Corretto
- La barra in basso resta sempre sopra i pasti quando si scorre la pagina.

## [1.1.4] - 2026-11-09

### Corretto
- Nella libreria degli alimenti si vede la porzione con i suoi grammi e le sue calorie, per esempio «1 pezzo (50 g) · 195 kcal», oltre ai valori per 100 g. Lo stesso in Aggiungi pasto, quando cerchi un alimento.
- Tornato lo spazio prima del puntino in alcune righe, come «100 g· 1 pezzo».

## [1.1.3] - 2026-11-09

### Aggiunto
- Più alimenti scritti insieme diventano voci separate: «100 g di petto di pollo e 100 g di patate e cipolle» dà due righe, ognuna con la sua quantità, i suoi valori e la sua stima.
- Le quantità si scelgono con dei tag: grammi, ml, unità, confezione, cucchiaio e cucchiaino.
- Sistema di misura americano nel Profilo: once, fl oz, tazze e peso in libbre. I dati restano salvati in grammi e chili.
- Scorrendo verso sinistra uno slot o una voce compare il cestino: lo slot si svuota o la voce si elimina, con «Annulla» per qualche secondo.
- Nel diario ogni voce mostra quantità e calorie.
- Un sito di presentazione con il logo, le icone e le schermate dell'app.

### Modificato
- Le barre di calorie e macronutrienti si riempiono con un'animazione e cambiano colore: verde dentro la soglia, giallo vicino, rosso lontano dal minimo o oltre il massimo. Gli stessi colori nel grafico di Andamento.
- Lo slot da compilare ha il bordo continuo invece che tratteggiato.
- Il connettore claude.ai registra una voce per ogni alimento del pasto.
- Il pulsante «Calcola con Claude» nel pasto ora si chiama «Stima», con la stellina.
- Nel diario il pulsante per le voci senza valori ora dice «Stima le voci senza valori».

### Corretto
- Aggiustata l'intestazione nell'app installata su iPhone, che restava sotto la sfocatura in alto.

## [1.1.2] - 2026-11-09

### Corretto
- Aggiustata di nuovo l'intestazione su iPhone: la parte alta del titolo restava un po' sfocata.

### Modificato
- Automatizzata la pubblicazione delle versioni.

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
