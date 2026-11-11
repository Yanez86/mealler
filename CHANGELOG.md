# Changelog

Tutte le modifiche rilevanti di Mealler sono annotate qui.
Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/) e il progetto usa il [versionamento semantico](https://semver.org/lang/it/).

## [1.6.4] - 2026-11-11

### Aggiunto
- In Andamento, toccando una barra si vede il dettaglio di quel giorno: calorie e macronutrienti (o l'acqua), con il pulsante «Apri il giorno» per andare al Diario.
- In Andamento c'è la scheda «Tendenza», con un grafico a linea per giorno, sul periodo scelto, oppure per mese, con la media di ogni mese negli ultimi 12 mesi. Anche qui si tocca un punto per vederne il valore. Vale per i nutrienti e per l'acqua.

### Corretto
- Corretto un problema relativo all'impaginazione della media in Andamento, che andava a capo con i nomi più lunghi.

## [1.6.3] - 2026-11-11

### Aggiunto
- Calorie e macronutrienti hanno le loro icone: una fiamma, una bistecca, una spiga, una goccia d'olio e una foglia. Si vedono nel riepilogo del Diario, in Andamento e nelle Soglie.
- In Profilo → Preferenze c'è «Senza carne»: nelle immagini dell'app, al posto della carne compaiono legumi e verdure. Le proteine diventano due fagioli, il logo ha una carota e l'animazione d'attesa è una carota. Gli alimenti che registri restano come sono.

## [1.6.2] - 2026-11-11

### Modificato
- Il link «Torna a oggi» in cima al Diario non c'è più: per tornare a oggi c'è il pulsante «Torna a oggi» in fondo al calendario, oppure il logo in alto a sinistra.

## [1.6.1] - 2026-11-11

### Aggiunto
- I Preferiti hanno tre schede: Pasti, Alimenti e Libreria.
- Alimenti preferiti: si crea un alimento con «Nuovo alimento preferito», oppure si mette la stella a un prodotto della Libreria. La stella è personale.
- Nella schermata del pasto le scorciatoie sono divise tra pasti preferiti e alimenti preferiti; un prodotto con la stella si apre in «Dalla libreria», pronto per scegliere la quantità.
- Profilo → Comandi Rapidi: con una chiave personale si crea un comando di iPhone che segna un bicchiere d'acqua dallo schermo bloccato, dal Centro di Controllo, dal Tasto Azione o con Siri. La pagina spiega i passaggi.
- Su Android, tenendo premuta l'icona di Mealler compare «Bevi un bicchiere».
- Promemoria per bere, in Profilo → Notifiche: una notifica dopo qualche ora senz'acqua, nella fascia oraria scelta, finché non raggiungi l'obiettivo.

### Modificato
- La scheda della libreria condivisa si chiama ora «Libreria».

## [1.6.0] - 2026-11-11

### Aggiunto
- Acqua: nel Diario una bottiglia si riempie a ogni tocco su «Bicchiere», fino all'obiettivo del giorno. Il pulsante «−» toglie l'ultimo bicchiere.
- In Profilo → Soglie si scelgono l'obiettivo giornaliero d'acqua e la misura del bicchiere, e si può nascondere l'acqua dal Diario.
- In Andamento c'è la scheda «Acqua», con il grafico dei giorni e quanti hanno raggiunto l'obiettivo.
- Tre nuovi traguardi per l'acqua.
- Con il connettore di claude.ai si può segnare anche l'acqua bevuta.
- Pasti preferiti di più alimenti: in Preferiti si crea un pasto nuovo, e la matita apre il pasto per modificarlo.
- «Salva nei preferiti» funziona anche per un pasto di più alimenti.

### Modificato
- Un preferito di più alimenti riempie la schermata del pasto con un alimento per riga: prima di salvare si possono cambiare le quantità o togliere qualcosa.

### Corretto
- Corretto un problema relativo al testo sotto i pasti nell'elenco dei Preferiti.

## [1.5.2] - 2026-11-11

### Aggiunto
- Nel diario si passa al giorno dopo scorrendo la pagina verso sinistra, e a quello prima scorrendola verso destra. Sulle schede dei pasti e sulle voci lo scorrimento verso sinistra resta quello che mostra il cestino.
- Gli alimenti della libreria si eliminano scorrendo la riga verso sinistra e toccando il cestino, come nei Preferiti. Lo può fare chi ha aggiunto l'alimento o un amministratore.
- Andamento, Preferiti e Profilo hanno ciascuno la propria icona in cima alla pagina.

### Modificato
- Il pulsante «Oggi» nella barra in basso si chiama ora «Diario».

### Corretto
- Corretto un problema relativo agli aggiornamenti interrotti a metà.
- Corretto un problema relativo all'elenco degli utenti e degli inviti in Amministrazione sullo schermo del telefono.

## [1.5.1] - 2026-11-11

### Modificato
- Le novità della versione 1.5.0 sono raccontate in modo più semplice, senza tecnicismi.

## [1.5.0] - 2026-11-11

Correzioni nate dalla revisione di sicurezza, usabilità e consumi della 1.4.1.

### Da sapere prima di aggiornare
- Se Mealler è raggiungibile da internet tramite un reverse proxy o un tunnel, prima di aggiornare controlla le impostazioni consigliate nella guida di installazione.
- Il calcolo con Claude ha ora un tetto di spesa mensile predefinito, che l'amministratore può cambiare.
- Dopo un cambio di password le app collegate da claude.ai vanno autorizzate di nuovo.

### Aggiunto
- Password dimenticata: l'amministratore può creare un link con cui l'utente sceglie una nuova password.
- Gli account sono più protetti dai tentativi di accesso ripetuti.
- Quello che scrivi per un nuovo pasto resta come bozza se esci dalla schermata senza salvare.
- I preferiti si usano con un tocco dalla loro pagina e si possono rinominare.
- Gli slot archiviati si possono ripristinare.

### Modificato
- Le eliminazioni e le altre azioni delicate chiedono conferma.
- Aggiungere un alimento da un codice a barre che non è in libreria è più scorrevole.
- Migliorie alla sicurezza e all'installazione.

### Corretto
- Corretto un problema relativo all'aggiornamento del diario e del giorno mostrato come «Oggi».
- Corretto un problema relativo all'invio delle voci scritte offline.
- Corretto un problema relativo alla sessione scaduta.
- Corretto un problema relativo alla lettura dei numeri nei moduli.
- Corretto un problema relativo ai limiti di spesa del calcolo con Claude.

## [1.4.1] - 2026-11-10

### Modificato
- Nei Preferiti si elimina un pasto scorrendo la riga verso sinistra e toccando il cestino, come per le voci del diario. Il pulsante «Rimuovi» non c'è più.
- L'avviso «Traguardo sbloccato» si chiude scorrendolo verso sinistra.
- In Andamento le barre si alzano dalla base una dopo l'altra quando compare il grafico o cambi nutriente.
- Le barre di calorie e macronutrienti e il grafico di Andamento tornano ai colori dello stato: verde acqua dentro la soglia, blu sotto, arancione sopra.

## [1.4.0] - 2026-11-10

### Aggiunto
- Traguardi: 23 obiettivi con medaglie, in Profilo → Traguardi. Prime volte (codice a barre, giornata completa, piatto, stima, pesata, etichetta, preferito), serie e totali di giornate complete, pesate e giorni nelle soglie, collezioni e abitudini. Si calcolano dal diario, quindi valgono anche per il passato, e una volta sbloccati restano anche se cancelli i dati. Un avviso annuncia quelli sbloccati oggi.
- Piatti con i loro ingredienti: «carbonara: 70 g pasta, 50 g guanciale, 30 g pecorino» diventa una sola voce, stimata dagli ingredienti elencati. Anche il connettore claude.ai può registrare un piatto così.
- Nella schermata del pasto, il «?» accanto al campo apre i consigli per scrivere una buona stima, con l'icona di un diario e una penna.

### Modificato
- Il nome Mealler è disegnato a tratti, con forchetta e coltello, nella schermata di avvio e nel sito.
- La regola «scrivi gli alimenti con la quantità» si trova ora tra i consigli del «?», e non compare più la nota «il calcolo con Claude non è attivo».

## [1.3.1] - 2026-11-09

### Aggiunto
- In «Informazioni», sotto il nome, la pillola «Splash page» mostra la schermata di avvio; un tocco la richiude.
- Nella schermata del pasto, «Tabella valori»: scrivi l'alimento, scegli la foto o lo screenshot della tabella nutrizionale (o della lista ingredienti con i grammi) e l'AI ne copia i valori nella riga, come un solo alimento con il peso totale. Se non hai scritto la quantità, la ricava dall'immagine.

### Modificato
- Nella schermata di avvio le colonne di icone scorrono piano, una verso l'alto e la vicina verso il basso.
- I pulsanti foto permettono di scegliere un'immagine dalla galleria, non solo di scattarla.
- «Foto» si chiama «Foto del piatto», per distinguerla da «Tabella valori».
- La foto della tabella nella scheda alimento legge anche gli screenshot e le liste ingredienti con i grammi; se l'AI non può leggerla, ora lo dice.
- I messaggi d'errore in fondo ai moduli scorrono in vista, invece di restare fuori dallo schermo.

### Corretto
- Con Claude Sonnet 5.5 o Opus 5.5 come modello, la lettura delle foto falliva sempre («tool_choice … not supported for this model»): ora le risposte dell'AI usano gli structured outputs, che funzionano con tutti i modelli.
- Su iPhone le foto scelte per «Tabella valori» e «Foto del piatto» non arrivavano all'AI («Qualcosa è andato storto»): ora vengono aperte in un modo che Safari accetta.
- Gli errori del calcolo AI arrivano all'app anche dietro Cloudflare (prima diventavano «502 internal») e nel log del server compare il motivo dato da Anthropic.

## [1.3.0] - 2026-11-09

### Aggiunto
- Ogni alimento della libreria può avere la foto della tabella nutrizionale, visibile a tutti nella scheda dell'alimento per leggere tutti i valori. Con il codice a barre viene scaricata da Open Food Facts; altrimenti si scatta con «Foto della tabella nutrizionale», che funziona anche senza AI (con l'AI attiva legge anche i valori).
- Nel profilo, «Informazioni su Mealler»: cos'è, com'è fatto, da dove vengono i valori nutrizionali.

### Modificato
- Lo scanner del codice a barre chiede più risoluzione, la messa a fuoco continua e uno zoom 2x, e cerca solo i codici EAN/UPC: si legge meglio tenendo il telefono a circa 20 cm.

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
