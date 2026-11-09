# Sito di presentazione

Pagina statica che presenta Mealler, con il logo e le icone degli alimenti dell'app.

- `index.html`, `style.css`: la pagina. I colori sono quelli dell'app (`apps/web/src/app.css`), tema chiaro e scuro compresi.
- `screenshots/`: schermate reali dell'app con dati dimostrativi, in versione chiara e scura (390×844 a 2x, WebP).
- `build.mjs`: crea `site/dist` copiando la pagina e prendendo logo e icone da `apps/web/static`, così il sito usa sempre la grafica dell'app.

```bash
node site/build.mjs
python3 -m http.server -d site/dist 8080   # anteprima su http://localhost:8080
```

Il workflow `.github/workflows/pages.yml` pubblica il sito su GitHub Pages a ogni modifica su `main`. Va attivato una volta in **Settings → Pages → Source: GitHub Actions**.
