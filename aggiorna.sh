#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Aggiorna Mealler: mostra le novità (commit e CHANGELOG), chiede conferma, scarica il codice,
# ricompila l'immagine, salva un backup dei dati e riavvia. Da lanciare nella cartella di Mealler.
#
#   ./aggiorna.sh                 aggiorna e ricompila sul NAS
#   ./aggiorna.sh -y              senza chiedere conferma
#   ./aggiorna.sh --immagine      scarica l'immagine pronta da GitHub invece di compilarla
#                                 (è pronta circa 5 minuti dopo ogni pubblicazione)
#   ./aggiorna.sh --senza-backup  salta il backup della cartella dati
#   ./aggiorna.sh --forza         ricompila e riavvia anche senza novità
#
# Se Docker chiede i permessi di amministratore: sudo ./aggiorna.sh
# I backup vanno in backups/ (restano gli ultimi 5).

set -euo pipefail

PREVIOUS=""

# Tutto dentro main: git pull può cambiare questo file mentre gira, bash ha già letto la funzione intera.
main() {
  local dir
  dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$dir"

  local yes=0 image=0 backup=1 force=0 arg
  for arg in "$@"; do
    case "$arg" in
      -y | --si) yes=1 ;;
      --immagine) image=1 ;;
      --senza-backup) backup=0 ;;
      --forza) force=1 ;;
      -h | --help)
        sed -n '3,14p' "$0" | sed 's/^# \{0,1\}//'
        return 0
        ;;
      *) die "Opzione sconosciuta: $arg (vedi ./aggiorna.sh --help)" ;;
    esac
  done

  # ---------- Controlli ----------
  command -v git > /dev/null || die "Manca git."
  command -v docker > /dev/null || die "Manca docker."
  docker info > /dev/null 2>&1 || die "Docker non risponde: prova con  sudo ./aggiorna.sh"
  if docker compose version > /dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif command -v docker-compose > /dev/null; then
    COMPOSE=(docker-compose)
  else
    die "Manca Docker Compose."
  fi
  # Con sudo, git gira come il proprietario della cartella: niente file di root nel repository.
  OWNER="$(stat -c %U "$dir" 2> /dev/null || echo "")"
  REPO="$dir"

  local branch
  branch="$(git_ rev-parse --abbrev-ref HEAD)"

  # ---------- Novità ----------
  step "Cerco aggiornamenti su GitHub"
  git_ fetch --quiet origin "$branch" || die "Non riesco a contattare GitHub."
  local remote="origin/$branch" count from to
  count="$(git_ rev-list --count "HEAD..$remote")"
  from="$(version_at HEAD)"
  to="$(version_at "$remote")"

  if [ "$count" = 0 ]; then
    if [ "$force" = 0 ]; then
      ok "Mealler è già aggiornato (versione $from)."
      return 0
    fi
    echo "Il codice è già alla versione $from (nessun commit nuovo da scaricare): ricompilo e riavvio con questa versione."
  else
    echo
    if [ "$from" != "$to" ]; then
      echo "$(bold "Versione $from → $to")  ·  $count commit nuovi"
    else
      echo "$(bold "Versione $from")  ·  $count commit nuovi"
    fi
    echo
    git_ --no-pager log --no-merges --date=format-local:'%d/%m %H:%M' \
      --format='  %C(auto,yellow)%h%C(auto,reset)  %ad  %s' "HEAD..$remote"
    if [ "$from" != "$to" ]; then
      echo
      echo "$(bold "Dal CHANGELOG")"
      local changelog
      changelog="$(git_ show "$remote:CHANGELOG.md" 2> /dev/null || true)"
      # Le sezioni sopra la versione installata.
      printf '%s\n' "$changelog" |
        awk -v installed="## [$from]" '
          index($0, installed) == 1 { stop = 1 }
          /^## \[/ { show = 1 }
          show && !stop && n++ < 60 { print "  " $0 }'
    fi
    echo
  fi

  local changes
  changes="$(git_ status --porcelain --untracked-files=no)"
  if [ -n "$changes" ]; then
    echo "Hai modifiche locali a questi file: le metto da parte e le riapplico dopo l'aggiornamento."
    printf '%s\n' "$changes" | sed 's/^/  /'
    echo
  fi

  if [ "$yes" = 0 ]; then
    [ -t 0 ] || die "Serve una conferma: rilancia con -y."
    local answer
    read -r -p "Aggiorno Mealler? [s/N] " answer
    case "$answer" in
      s | S | si | sì | Si | Sì | y | Y) ;;
      *)
        echo "Annullato, non ho cambiato nulla."
        return 0
        ;;
    esac
  fi

  # ---------- Codice ----------
  PREVIOUS="$(git_ rev-parse --short HEAD)"
  if [ "$count" != 0 ]; then
    step "Scarico il codice"
    git_ pull --ff-only --autostash --quiet origin "$branch" ||
      die "git pull non riuscito: controlla  git status  (il commit di prima era $PREVIOUS)."
  fi

  # ---------- Immagine ----------
  # Mealler resta acceso mentre l'immagine nuova si prepara.
  if [ "$image" = 1 ]; then
    step "Scarico l'immagine pronta"
    "${COMPOSE[@]}" pull
  else
    step "Ricompilo l'immagine (qualche minuto)"
    "${COMPOSE[@]}" build --pull
  fi

  # ---------- Backup ----------
  local file=""
  if [ "$backup" = 1 ]; then
    step "Backup dei dati"
    mkdir -p backups
    file="backups/mealler-$(date +%Y%m%d-%H%M%S).tgz"
    # A Mealler fermo il database è coerente; il backup legge il volume da un container temporaneo.
    "${COMPOSE[@]}" stop mealler > /dev/null 2>&1 || true
    if ! "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint tar mealler czf - -C /data . > "$file" || [ ! -s "$file" ]; then
      rm -f "$file"
      "${COMPOSE[@]}" up -d > /dev/null 2>&1 || true
      die "Backup non riuscito: Mealler è ripartito con l'immagine nuova, controlla con  docker compose logs mealler"
    fi
    echo "  $file ($(du -h "$file" | cut -f1))"
    # Restano gli ultimi 5.
    { ls -1t backups/mealler-*.tgz 2> /dev/null || true; } | tail -n +6 | while read -r old; do rm -f -- "$old"; done
  fi

  # ---------- Avvio ----------
  step "Riavvio Mealler"
  "${COMPOSE[@]}" up -d
  wait_healthy

  # Le immagini vecchie rimaste senza nome (non usate da nessun container) occupano spazio sul NAS.
  docker image prune -f > /dev/null 2>&1 || true

  echo
  ok "Mealler aggiornato alla versione $(version_at HEAD)."
  if [ -n "$file" ]; then echo "  Backup dei dati: $file"; fi
  echo "  Per tornare indietro: git checkout $PREVIOUS, poi ripristina il backup (vedi docs/INSTALL.md)."
}

# ---------- Funzioni ----------

git_() {
  if [ "$(id -u)" = 0 ] && [ -n "$OWNER" ] && [ "$OWNER" != root ] && command -v sudo > /dev/null; then
    sudo -u "$OWNER" git -C "$REPO" "$@"
  else
    git -c safe.directory="$REPO" -C "$REPO" "$@"
  fi
}

version_at() {
  { git_ show "$1:package.json" 2> /dev/null || true; } | sed -n 's/^  "version": "\(.*\)",$/\1/p'
}

wait_healthy() {
  local id status i
  id="$("${COMPOSE[@]}" ps -q mealler)"
  [ -n "$id" ] || die "Il container di Mealler non è partito: docker compose logs mealler"
  for i in $(seq 1 60); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2> /dev/null || echo "?")"
    case "$status" in
      healthy | running) return 0 ;;
      unhealthy | exited | dead)
        "${COMPOSE[@]}" logs --tail 30 mealler || true
        die "Mealler non riparte (stato: $status). Il commit di prima era ${PREVIOUS:-?}."
        ;;
    esac
    sleep 2
  done
  die "Mealler non ha risposto entro 2 minuti: docker compose logs mealler"
}

if [ -t 1 ]; then
  bold() { printf '\033[1m%s\033[0m' "$*"; }
  step() { printf '\n\033[1;36m==>\033[0m \033[1m%s\033[0m\n' "$*"; }
  ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
  die() {
    printf '\033[1;31m✗\033[0m %s\n' "$*" >&2
    exit 1
  }
else
  bold() { printf '%s' "$*"; }
  step() { printf '\n==> %s\n' "$*"; }
  ok() { printf '✓ %s\n' "$*"; }
  die() {
    printf '✗ %s\n' "$*" >&2
    exit 1
  }
fi

main "$@"
exit
