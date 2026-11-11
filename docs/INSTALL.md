# Installare Mealler

Questa guida copre l'installazione con Docker, l'esposizione in HTTPS (Cloudflare Tunnel, Caddy o Traefik), backup, ripristino e aggiornamenti.

Requisiti: un computer o NAS sempre acceso con Docker e Docker Compose (amd64 o arm64), circa 200 MB di spazio più i dati.

## 1. Avvio

```bash
git clone https://github.com/Yanez86/mealler.git
cd mealler
cp .env.example .env
docker compose pull
docker compose up -d
```

Apri `http://IP-DEL-SERVER:3000` (o la porta scelta in `MEALLER_PORT`): la prima pagina crea l'account **amministratore**.

Per usare una versione precisa invece di `latest`, modifica `image:` in `docker-compose.yml`, per esempio `ghcr.io/yanez86/mealler:1.5.2` (sono pubblicati anche `1.2` e `1`).

Senza HTTPS Mealler funziona nella rete di casa, ma il telefono **non** installa la PWA e **non** riceve notifiche: per quelle serve uno dei metodi qui sotto. In tutti i casi imposta nel file `.env`:

```bash
MEALLER_BASE_URL=https://mealler.miodominio.it
MEALLER_BIND=127.0.0.1
```

e riavvia con `docker compose up -d`.

`MEALLER_BIND=127.0.0.1` **non è facoltativo** quando Mealler è raggiungibile da internet: senza, la porta 3000 resta aperta su tutte le interfacce del server e chi la raggiunge scavalca il proxy, in HTTP semplice (cookie di sessione senza `Secure`) e potendo falsificare il proprio indirizzo per aggirare i limiti sui tentativi di accesso. Le porte pubblicate da Docker ignorano inoltre le regole di `ufw`. Con `127.0.0.1` la porta risponde solo dal server stesso; il proxy e il tunnel dei metodi qui sotto parlano con Mealler dentro la rete Docker e non ne hanno bisogno.

## 2a. HTTPS con Cloudflare Tunnel (nessuna porta aperta sul router)

1. Nella dashboard Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**. Copia il token (la lunga stringa dopo `--token`).
2. Aggiungi al file `.env`:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...
   ```
3. Crea accanto a `docker-compose.yml` un file `compose.override.yaml`:
   ```yaml
   services:
     tunnel:
       image: cloudflare/cloudflared:latest
       container_name: mealler-tunnel
       restart: unless-stopped
       command: tunnel --no-autoupdate run
       environment:
         TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
       depends_on:
         - mealler
   ```
4. `docker compose up -d`.
5. Nel tunnel, **Public Hostname → Add**: sottodominio e dominio a scelta, *Service* `HTTP` e URL `mealler:3000` (il nome del container e la porta **interna**, non quella del NAS).

Non attivare Cloudflare Access su questo hostname: bloccherebbe il connettore claude.ai e le notifiche. Mealler ha già il suo login.

Il token del tunnel è un segreto: tienilo solo nel file `.env` del server.

## 2b. HTTPS con Caddy (porte 80 e 443 aperte verso il server)

`compose.override.yaml`:

```yaml
services:
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
volumes:
  caddy-data:
```

`Caddyfile`:

```
mealler.miodominio.it {
	reverse_proxy mealler:3000
}
```

Caddy ottiene il certificato da solo. Il record DNS del dominio deve puntare al tuo IP pubblico.

## 2c. HTTPS con Traefik

Se usi già Traefik, aggiungi a `compose.override.yaml` le etichette del servizio (adatta `websecure`, `le` e la rete ai nomi della tua configurazione):

```yaml
services:
  mealler:
    labels:
      - traefik.enable=true
      - traefik.http.routers.mealler.rule=Host(`mealler.miodominio.it`)
      - traefik.http.routers.mealler.entrypoints=websecure
      - traefik.http.routers.mealler.tls.certresolver=le
      - traefik.http.services.mealler.loadbalancer.server.port=3000
    networks:
      - traefik
networks:
  traefik:
    external: true
```

## 2d. Cosa Mealler si aspetta dal proxy

Il proxy deve passare le intestazioni `X-Forwarded-Proto` e `X-Forwarded-For`: Caddy, Traefik, nginx e Cloudflare lo fanno di default. Dalla prima Mealler capisce di essere in HTTPS, usa i cookie sicuri e attiva HSTS; dalla seconda ricava l'indirizzo di chi si collega, su cui contano i limiti dei tentativi di accesso.

Mealler crede a queste intestazioni solo se arrivano da un indirizzo **privato o locale** (un proxy sullo stesso server o nella stessa rete Docker, come in tutti i metodi qui sopra): quello che scrive un estraneo viene ignorato. Se il tuo proxy sta altrove, indica i suoi indirizzi o le sue reti in `.env`, separati da virgole:

```bash
MEALLER_TRUST_PROXY=203.0.113.10, 198.51.100.0/24
```

`MEALLER_TRUST_PROXY=none` non si fida di nessuno (Mealler esposto direttamente, senza proxy).

## 3. Cosa c'è nella cartella dati

Tutto sta nel volume `mealler-data`, montato su `/data`:

| File | Contenuto |
| --- | --- |
| `mealler.db`, `mealler.db-wal`, `mealler.db-shm` | Database: utenti, diario, soglie, pesi, libreria alimenti, impostazioni |
| `secret.key` | Chiave che cifra la chiave API Anthropic salvata nel database. **Senza questo file la chiave API non è più leggibile** (va reinserita) |
| `photos/` | Foto dei pasti e delle etichette, se l'amministratore ha scelto di conservarle |

## 4. Backup

Il modo più semplice, a container fermo per qualche secondo:

```bash
cd ~/mealler
docker compose stop mealler
docker run --rm -v mealler_mealler-data:/data -v "$PWD":/backup alpine \
  sh -c "umask 077 && tar czf /backup/mealler-$(date +%F).tar.gz -C /data ."
docker compose start mealler
```

Il nome del volume è `<cartella>_mealler-data`; controllalo con `docker volume ls`.

Senza fermare il container (copia coerente del database fatta da SQLite):

```bash
docker exec mealler node -e "require('better-sqlite3')('/data/mealler.db').backup('/data/backup.db').then(()=>console.log('ok'))"
docker cp mealler:/data/backup.db ./mealler-$(date +%F).db
docker cp mealler:/data/secret.key ./secret.key
docker exec mealler rm /data/backup.db
chmod 600 mealler-*.db secret.key
```

Un backup contiene i diari, le foto e `secret.key`, cioè tutto quello che serve per leggere i dati e decifrare la chiave API: i comandi qui sopra lo creano leggibile solo dal suo proprietario (`umask 077`, `chmod 600`), e `aggiorna.sh` fa lo stesso con la cartella `backups/`. Conserva i backup fuori dal NAS: contengono dati sanitari personali, trattali con cura.

## 5. Ripristino

```bash
cd ~/mealler
docker compose down
docker volume rm mealler_mealler-data
docker volume create mealler_mealler-data
docker run --rm -v mealler_mealler-data:/data -v "$PWD":/backup alpine \
  sh -c "tar xzf /backup/mealler-AAAA-MM-GG.tar.gz -C /data && chown -R 1000:1000 /data"
docker compose up -d
```

Se ripristini solo il database (`backup.db`), copialo come `/data/mealler.db`, rimuovi gli eventuali `mealler.db-wal` e `mealler.db-shm` e rimetti `secret.key`.

## 6. Aggiornamenti

Il modo più semplice è lo script `aggiorna.sh`, nella cartella di Mealler:

```bash
cd ~/mealler
./aggiorna.sh            # oppure: sudo ./aggiorna.sh, se Docker lo richiede
```

Lo script:

1. cerca aggiornamenti su GitHub e mostra i commit nuovi, il cambio di versione e le voci del CHANGELOG;
2. chiede conferma (`-y` per non chiederla);
3. scarica il codice, mettendo da parte e riapplicando le tue modifiche locali (per esempio a `docker-compose.yml`);
4. ricompila l'immagine sul NAS mentre Mealler resta acceso (`--immagine` per scaricare quella pronta da GitHub, disponibile circa 5 minuti dopo ogni pubblicazione);
5. ferma Mealler e salva un backup della cartella dati in `backups/` (restano gli ultimi 5; `--senza-backup` per saltarlo);
6. riavvia Mealler, aspetta che risponda e libera lo spazio delle immagini vecchie.

Se non ci sono novità si ferma subito; `--forza` ricompila e riavvia comunque. Se un aggiornamento si è interrotto a metà (il codice è nuovo ma Mealler gira ancora con la versione di prima), lo script se ne accorge e lo completa. Se la cartella `backups/` è di root, perché un aggiornamento precedente è partito con `sudo`, lo script si ferma prima di cambiare qualcosa e dice come sistemarla; con `sudo` la cartella resta dell'utente che possiede la cartella di Mealler. Per ripristinare uno di questi backup usa la procedura del punto 5 con il file di `backups/`, per esempio `tar xzf /backup/backups/mealler-20261109-183000.tgz`.

A mano, senza script:

```bash
cd ~/mealler
git pull
docker compose pull
docker compose up -d
```

Le migrazioni del database partono da sole all'avvio. Fai un backup prima degli aggiornamenti di versione principale. Gli amministratori vedono nell'app un avviso quando esce una nuova versione (disattivabile con `MEALLER_UPDATE_CHECK=false`); tutti gli utenti vedono le novità nella pagina **Novità**.

Per tornare a una versione precedente, imposta il suo tag in `image:` e ripristina il backup fatto prima dell'aggiornamento: le migrazioni non si annullano da sole.

## 7. Password dimenticata

Un amministratore apre **Profilo → Amministrazione → Utenti** e tocca **Link nuova password** accanto all'utente: il link, valido 24 ore e usabile una volta, viene copiato e va mandato all'utente, che sceglie da sé la nuova password. Chi la reimposta viene disconnesso da tutti i dispositivi e dalle app collegate con il connettore.

Se a non poter più entrare è l'unico amministratore, crea il link dal server:

```bash
docker exec mealler node dist/index.js reset-password nome@esempio.it
```

## 8. Problemi frequenti

- **`port is already allocated`**: un altro servizio usa la porta. Cambia `MEALLER_PORT` nel file `.env` (es. `3080`).
- **`no configuration file provided`**: esegui i comandi dalla cartella `mealler`, dove si trova `docker-compose.yml`.
- **La PWA non si installa o le notifiche non arrivano**: serve HTTPS e `MEALLER_BASE_URL` corretto. Su iPhone la PWA va aggiunta alla schermata Home da Safari (iOS 16.4 o successivo) prima di attivare le notifiche.
- **Permessi sulla cartella dati** se usi una cartella del NAS al posto del volume: deve essere scrivibile dall'utente con UID 1000 (`chown -R 1000:1000 /percorso`).
- **Log**: `docker compose logs -f mealler`.
