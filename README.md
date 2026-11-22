# Zoro Note

Zoro Note è un editor di testo moderno e leggero realizzato come Progressive Web App (PWA). Funziona completamente offline nel browser ed è pronto per essere eseguito su qualsiasi dispositivo o pubblicato su GitHub Pages.

---

## Caratteristiche principali

- **Navigazione a schede multiple**: Gestione dinamica di più documenti contemporaneamente.
- **Supporto File System nativo**: Apertura e salvataggio diretto di file locali tramite File System Access API.
- **Comandi di modifica completi**: Ricerca e sostituzione avanzata (con supporto regex e maiuscole/minuscole), comando "Vai a riga" e inserimento data/ora.
- **Barra di stato interattiva**: Conteggio righe, colonne, caratteri, selezione, codifica e formato fine riga.
- **Personalizzazione e temi**: Supporto a tema Chiaro, Scuro o di Sistema, con selezione di font e dimensione testo.
- **Funzionamento offline**: Service Worker integrato per l'esecuzione senza connessione internet.

---

## Esecuzione in locale

È possibile eseguire l'applicazione con qualsiasi server HTTP statico locale, ad esempio con Python o Node:

```bash
# Con Python
python -m http.server 8080

# Oppure con npx
npx serve .
```

Aprire quindi il browser all'indirizzo indicato (ad es. `http://localhost:8080`).

---

## Pubblicazione su GitHub Pages

1. Inizializzare il repository Git locale:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Zoro Note PWA"
   ```

2. Collegare il repository remoto su GitHub:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<TUO-UTENTE>/<TUO-REPOSITORY>.git
   git push -u origin main
   ```

3. Abilitare GitHub Pages:
   - Andare su GitHub nelle **Settings** del repository.
   - Selezionare la sezione **Pages** nella barra laterale sinistra.
   - Sotto **Build and deployment**, impostare **Source** su `Deploy from a branch`.
   - Selezionare il ramo `main` e la cartella `/ (root)`, quindi premere **Save**.
   - L'applicazione sarà accessibile online in pochi minuti.
