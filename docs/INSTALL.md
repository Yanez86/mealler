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

Per usare una versione precisa invece di `latest`, modifica `image:` in `docker-compose.yml`, per esempio `ghcr.io/yanez86/mealler:1.1.2` (sono pubblicati anche `1.1` e `1`).

Senza HTTPS Mealler funziona nella rete di casa, ma il telefono **non** installa la PWA e **non** riceve notifiche: per quelle serve uno dei metodi qui sotto. In tutti i casi imposta nel file `.env`:

```bash
MEALLER_BASE_URL=https://mealler.miodominio.it
```

e riavvia con `docker compose up -d`.

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

Con un reverse proxy puoi togliere la riga `ports:` di Mealler, così è raggiungibile solo passando dal proxy.

Il proxy deve passare l'intestazione `X-Forwarded-Proto`: Caddy, Traefik, nginx e Cloudflare lo fanno di default. Da quella Mealler capisce di essere in HTTPS, usa i cookie sicuri e attiva HSTS.

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
  tar czf /backup/mealler-$(date +%F).tar.gz -C /data .
docker compose start mealler
```

Il nome del volume è `<cartella>_mealler-data`; controllalo con `docker volume ls`.

Senza fermare il container (copia coerente del database fatta da SQLite):

```bash
docker exec mealler node -e "require('better-sqlite3')('/data/mealler.db').backup('/data/backup.db').then(()=>console.log('ok'))"
docker cp mealler:/data/backup.db ./mealler-$(date +%F).db
docker cp mealler:/data/secret.key ./secret.key
docker exec mealler rm /data/backup.db
```

Conserva i backup fuori dal NAS: contengono dati sanitari personali, trattali con cura.

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

```bash
cd ~/mealler
git pull
docker compose pull
docker compose up -d
```

Le migrazioni del database partono da sole all'avvio. Fai un backup prima degli aggiornamenti di versione principale. Gli amministratori vedono nell'app un avviso quando esce una nuova versione (disattivabile con `MEALLER_UPDATE_CHECK=false`); tutti gli utenti vedono le novità nella pagina **Novità**.

Per tornare a una versione precedente, imposta il suo tag in `image:` e ripristina il backup fatto prima dell'aggiornamento: le migrazioni non si annullano da sole.

## 7. Problemi frequenti

- **`port is already allocated`**: un altro servizio usa la porta. Cambia `MEALLER_PORT` nel file `.env` (es. `3080`).
- **`no configuration file provided`**: esegui i comandi dalla cartella `mealler`, dove si trova `docker-compose.yml`.
- **La PWA non si installa o le notifiche non arrivano**: serve HTTPS e `MEALLER_BASE_URL` corretto. Su iPhone la PWA va aggiunta alla schermata Home da Safari (iOS 16.4 o successivo) prima di attivare le notifiche.
- **Permessi sulla cartella dati** se usi una cartella del NAS al posto del volume: deve essere scrivibile dall'utente con UID 1000 (`chown -R 1000:1000 /percorso`).
- **Log**: `docker compose logs -f mealler`.
