# Contribuire a Mealler

Grazie dell'interesse! Alcune regole per mantenere il progetto ordinato.

- **Licenza**: contribuendo accetti che il tuo codice sia distribuito con licenza AGPL-3.0-or-later. Ogni nuovo file sorgente inizia con `SPDX-License-Identifier: AGPL-3.0-or-later`.
- **Testi**: nessuna stringa fissa nell'interfaccia. Aggiungi la chiave in `packages/shared/src/i18n.ts`, in italiano e in inglese (il test controlla che i due cataloghi coincidano).
- **Database**: ogni modifica allo schema è un nuovo file `apps/server/migrations/NNNN_descrizione.sql`, mai una modifica a una migrazione esistente. Aggiorna anche `apps/server/src/db/schema.ts`.
- **Dati per utente**: ogni query su dati personali filtra per `user_id`. I test in `apps/server/test` verificano l'isolamento tra utenti: estendili quando aggiungi un endpoint.
- **Accessibilità**: WCAG 2.2 AA, aree di tocco di almeno 44–48 px, stati mai affidati al solo colore.
- **Changelog**: annota ogni modifica visibile in `CHANGELOG.md`, sotto "Non rilasciato". Scrivi per chi usa l'app, non per chi la sviluppa: voci brevi e volutamente generiche, senza dettagli tecnici (niente nomi di variabili, comandi, intestazioni, messaggi d'errore o spiegazioni di come è fatta la correzione). Vale soprattutto per modifiche e correzioni, dove basta un «Corretto un problema relativo a…». I dettagli stanno nei commit e nella documentazione.

Prima di aprire una pull request:

```bash
pnpm typecheck && pnpm test && pnpm build
```
