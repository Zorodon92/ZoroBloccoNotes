/**
 * Zoro Note - Progressive Web App (PWA)
 * Architettura Clean-Room basata sull'ingegneria inversa funzionale di Notepad
 */

(function () {
  'use strict';

  // --- REGISTRAZIONE SERVICE WORKER (PWA Offline-First) ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('Registrazione Service Worker non riuscita:', err);
      });
    });
  }

  // --- STATO DELL'APPLICAZIONE ---
  const DEFAULT_SETTINGS = {
    theme: 'system',
    fontFamily: "Consolas, 'Courier New', monospace",
    fontSize: 12,
    wordWrap: true,
    statusBar: true,
    startupBehavior: 'restore',
    zoomLevel: 100
  };

  let state = {
    tabs: [],
    activeTabId: null,
    settings: { ...DEFAULT_SETTINGS },
    findState: {
      activeMatchIndex: -1,
      matches: [],
      query: ''
    }
  };

  // --- RIFERIMENTI DOM ---
  const dom = {
    app: document.getElementById('app'),
    tabsList: document.getElementById('tabsList'),
    tabsScroll: document.getElementById('tabsScroll'),
    btnNewTab: document.getElementById('btnNewTab'),
    btnSettings: document.getElementById('btnSettings'),
    mainTextArea: document.getElementById('mainTextArea'),
    statusBar: document.getElementById('statusBar'),
    statusCursor: document.getElementById('statusCursor'),
    statusChars: document.getElementById('statusChars'),
    statusZoom: document.getElementById('statusZoom'),
    statusLineEnding: document.getElementById('statusLineEnding'),
    statusEncoding: document.getElementById('statusEncoding'),
    fileInputFallback: document.getElementById('fileInputFallback'),

    // Menu
    menuItems: document.querySelectorAll('.menu-item'),
    menuToggleWordWrap: document.getElementById('menuToggleWordWrap'),
    wordWrapCheckMark: document.getElementById('wordWrapCheckMark'),
    menuToggleStatusBar: document.getElementById('menuToggleStatusBar'),

    // Find & Replace
    findReplaceBar: document.getElementById('findReplaceBar'),
    findInput: document.getElementById('findInput'),
    replaceInput: document.getElementById('replaceInput'),
    replaceRow: document.getElementById('replaceRow'),
    findMatchesCount: document.getElementById('findMatchesCount'),
    btnFindPrev: document.getElementById('btnFindPrev'),
    btnFindNext: document.getElementById('btnFindNext'),
    btnToggleReplaceMode: document.getElementById('btnToggleReplaceMode'),
    btnCloseFind: document.getElementById('btnCloseFind'),
    btnReplaceSingle: document.getElementById('btnReplaceSingle'),
    btnReplaceAll: document.getElementById('btnReplaceAll'),
    chkMatchCase: document.getElementById('chkMatchCase'),
    chkWholeWord: document.getElementById('chkWholeWord'),
    chkRegex: document.getElementById('chkRegex'),
    chkWrapAround: document.getElementById('chkWrapAround'),

    // Goto Modal
    gotoModal: document.getElementById('gotoModal'),
    gotoLineInput: document.getElementById('gotoLineInput'),
    gotoLineLabel: document.getElementById('gotoLineLabel'),
    btnGotoConfirm: document.getElementById('btnGotoConfirm'),
    btnGotoCancel: document.getElementById('btnGotoCancel'),

    // About Modal
    aboutModal: document.getElementById('aboutModal'),
    btnAboutClose: document.getElementById('btnAboutClose'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    btnSettingsClose: document.getElementById('btnSettingsClose'),
    btnSettingsDone: document.getElementById('btnSettingsDone'),
    fontFamilySelect: document.getElementById('fontFamilySelect'),
    fontSizeSelect: document.getElementById('fontSizeSelect'),
    fontPreviewBox: document.getElementById('fontPreviewBox'),
    settingsWordWrapToggle: document.getElementById('settingsWordWrapToggle'),
    lblWordWrapSwitch: document.getElementById('lblWordWrapSwitch')
  };

  // --- GESTIONE PERSISTENZA LOCALSTORAGE ---
  function loadSettings() {
    try {
      const saved = localStorage.getItem('zoro_note_settings');
      if (saved) {
        state.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Errore lettura impostazioni:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem('zoro_note_settings', JSON.stringify(state.settings));
    } catch (e) {
      console.warn('Errore salvataggio impostazioni:', e);
    }
  }

  function saveSession() {
    if (state.settings.startupBehavior !== 'restore') {
      localStorage.removeItem('zoro_note_session');
      return;
    }
    try {
      const serializableTabs = state.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        content: tab.content,
        isDirty: tab.isDirty,
        encoding: tab.encoding,
        lineEnding: tab.lineEnding
      }));
      localStorage.setItem(
        'zoro_note_session',
        JSON.stringify({
          tabs: serializableTabs,
          activeTabId: state.activeTabId
        })
      );
    } catch (e) {
      console.warn('Errore salvataggio sessione:', e);
    }
  }

  function loadSession() {
    if (state.settings.startupBehavior === 'restore') {
      try {
        const raw = localStorage.getItem('zoro_note_session');
        if (raw) {
          const session = JSON.parse(raw);
          if (Array.isArray(session.tabs) && session.tabs.length > 0) {
            state.tabs = session.tabs.map((t) => ({
              ...t,
              fileHandle: null,
              cursorStart: 0,
              cursorEnd: 0
            }));
            state.activeTabId = session.activeTabId || state.tabs[0].id;
            return true;
          }
        }
      } catch (e) {
        console.warn('Errore ripristino sessione:', e);
      }
    }
    return false;
  }

  // --- GESTIONE TEMI E STILI ---
  function applyTheme(theme) {
    state.settings.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    const radio = document.querySelector(`input[name="appTheme"][value="${theme}"]`);
    if (radio) radio.checked = true;
    saveSettings();
  }

  function applyEditorStyles() {
    const scale = state.settings.zoomLevel / 100;
    const effectiveSize = Math.max(6, Math.round(state.settings.fontSize * scale));
    dom.mainTextArea.style.fontFamily = state.settings.fontFamily;
    dom.mainTextArea.style.fontSize = `${effectiveSize}pt`;

    if (state.settings.wordWrap) {
      dom.mainTextArea.classList.remove('no-wrap');
      dom.wordWrapCheckMark.textContent = '✓';
    } else {
      dom.mainTextArea.classList.add('no-wrap');
      dom.wordWrapCheckMark.textContent = '';
    }

    if (state.settings.statusBar) {
      dom.statusBar.classList.remove('hidden');
    } else {
      dom.statusBar.classList.add('hidden');
    }

    dom.statusZoom.textContent = `${state.settings.zoomLevel}%`;
  }

  // --- GESTIONE SCHEDE (TabsBar) ---
  function createNewTab(title = 'Senza nome', content = '', fileHandle = null) {
    const newTab = {
      id: 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      title: title,
      content: content,
      isDirty: false,
      fileHandle: fileHandle,
      encoding: 'UTF-8',
      lineEnding: detectLineEnding(content) || 'CRLF',
      cursorStart: 0,
      cursorEnd: 0
    };

    state.tabs.push(newTab);
    renderTabs();
    switchTab(newTab.id);
    saveSession();
    return newTab;
  }

  function switchTab(tabId) {
    // Salva stato del tab attivo corrente
    const currentTab = getActiveTab();
    if (currentTab) {
      currentTab.content = dom.mainTextArea.value;
      currentTab.cursorStart = dom.mainTextArea.selectionStart;
      currentTab.cursorEnd = dom.mainTextArea.selectionEnd;
    }

    state.activeTabId = tabId;
    const nextTab = getActiveTab();
    if (!nextTab) return;

    dom.mainTextArea.value = nextTab.content;
    dom.mainTextArea.setSelectionRange(nextTab.cursorStart || 0, nextTab.cursorEnd || 0);
    dom.mainTextArea.focus();

    updateTitle();
    renderTabs();
    updateStatusBar();
    saveSession();
  }

  function closeTab(tabId) {
    const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = state.tabs[tabIndex];
    if (tab.isDirty) {
      const confirmClose = window.confirm(
        `Vuoi salvare le modifiche apportate a "${tab.title}" prima di chiudere la scheda?`
      );
      if (confirmClose) {
        saveFile().then((saved) => {
          if (saved) executeCloseTab(tabIndex);
        });
        return;
      }
    }

    executeCloseTab(tabIndex);
  }

  function executeCloseTab(tabIndex) {
    state.tabs.splice(tabIndex, 1);

    if (state.tabs.length === 0) {
      createNewTab();
      return;
    }

    // Se abbiamo chiuso il tab attivo, seleziona il vicino
    const nextActiveIndex = Math.min(tabIndex, state.tabs.length - 1);
    switchTab(state.tabs[nextActiveIndex].id);
    renderTabs();
    saveSession();
  }

  function getActiveTab() {
    return state.tabs.find((t) => t.id === state.activeTabId);
  }

  function updateTitle() {
    const tab = getActiveTab();
    if (tab) {
      const dirtyPrefix = tab.isDirty ? '• ' : '';
      document.title = `${dirtyPrefix}${tab.title} - Zoro Note`;
    } else {
      document.title = 'Zoro Note';
    }
  }

  function renderTabs() {
    dom.tabsList.innerHTML = '';

    state.tabs.forEach((tab) => {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab-item' + (tab.id === state.activeTabId ? ' active' : '') + (tab.isDirty ? ' dirty' : '');
      tabEl.dataset.tabId = tab.id;

      const dot = document.createElement('span');
      dot.className = 'tab-dirty-dot';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'tab-title';
      titleSpan.textContent = tab.title;

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tab-close-btn';
      closeBtn.title = 'Chiudi scheda (Ctrl+W)';
      closeBtn.innerHTML = '<svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>';

      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });

      tabEl.appendChild(dot);
      tabEl.appendChild(titleSpan);
      tabEl.appendChild(closeBtn);

      tabEl.addEventListener('click', () => {
        if (tab.id !== state.activeTabId) {
          switchTab(tab.id);
        }
      });

      dom.tabsList.appendChild(tabEl);
    });

    // Assicura visibilità scroll del tab attivo
    const activeEl = dom.tabsList.querySelector('.tab-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  // --- LOGICA FINE RIGA & CODIFICHE ---
  function detectLineEnding(text) {
    if (text.includes('\r\n')) return 'CRLF';
    if (text.includes('\n')) return 'LF';
    if (text.includes('\r')) return 'CR';
    return 'CRLF';
  }

  function normalizeLineEndings(text, endingType) {
    const raw = text.replace(/\r\n|\r|\n/g, '\n');
    if (endingType === 'CRLF') return raw.replace(/\n/g, '\r\n');
    if (endingType === 'CR') return raw.replace(/\n/g, '\r');
    return raw;
  }

  // --- OPERAZIONI FILE (File System Access API & Fallback) ---
  async function openFile() {
    if ('showOpenFilePicker' in window) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'File di testo',
              accept: { 'text/*': ['.txt', '.log', '.md', '.json', '.xml', '.html', '.css', '.js', '.ini', '.inf'] }
            }
          ]
        });

        for (const handle of handles) {
          const file = await handle.getFile();
          const text = await file.text();
          createNewTab(file.name, text, handle);
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Errore apertura file:', err);
      }
    } else {
      dom.fileInputFallback.click();
    }
  }

  dom.fileInputFallback.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      const text = await file.text();
      createNewTab(file.name, text, null);
    }
    dom.fileInputFallback.value = '';
  });

  async function saveFile() {
    const tab = getActiveTab();
    if (!tab) return false;

    // Se esiste già un handle di file aperto
    if (tab.fileHandle && 'createWritable' in tab.fileHandle) {
      try {
        const writable = await tab.fileHandle.createWritable();
        const contentFormatted = normalizeLineEndings(dom.mainTextArea.value, tab.lineEnding);
        await writable.write(contentFormatted);
        await writable.close();

        tab.isDirty = false;
        tab.content = dom.mainTextArea.value;
        renderTabs();
        updateTitle();
        saveSession();
        return true;
      } catch (err) {
        console.warn('Errore salvataggio diretto:', err);
      }
    }

    return await saveFileAs();
  }

  async function saveFileAs() {
    const tab = getActiveTab();
    if (!tab) return false;

    const contentFormatted = normalizeLineEndings(dom.mainTextArea.value, tab.lineEnding);

    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: tab.title.endsWith('.txt') ? tab.title : tab.title + '.txt',
          types: [
            {
              description: 'Documento di testo (*.txt)',
              accept: { 'text/plain': ['.txt'] }
            },
            {
              description: 'Tutti i file (*.*)',
              accept: { '*/*': [] }
            }
          ]
        });

        const writable = await handle.createWritable();
        await writable.write(contentFormatted);
        await writable.close();

        const file = await handle.getFile();
        tab.title = file.name;
        tab.fileHandle = handle;
        tab.isDirty = false;
        tab.content = dom.mainTextArea.value;

        renderTabs();
        updateTitle();
        saveSession();
        return true;
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Errore Salva con nome:', err);
        return false;
      }
    } else {
      // Fallback download browser
      const blob = new Blob([contentFormatted], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = tab.title.endsWith('.txt') ? tab.title : tab.title + '.txt';
      a.click();
      URL.revokeObjectURL(a.href);

      tab.isDirty = false;
      tab.content = dom.mainTextArea.value;
      renderTabs();
      updateTitle();
      saveSession();
      return true;
    }
  }

  async function saveAll() {
    for (const tab of state.tabs) {
      if (tab.isDirty) {
        switchTab(tab.id);
        await saveFile();
      }
    }
  }

  // Drag & Drop di file nella finestra
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of e.dataTransfer.files) {
        try {
          const text = await file.text();
          createNewTab(file.name, text, null);
        } catch (err) {
          console.error('Errore lettura file trascinato:', err);
        }
      }
    }
  });

  // --- BARRA DI STATO ---
  function updateStatusBar() {
    const tab = getActiveTab();
    if (!tab) return;

    const text = dom.mainTextArea.value;
    const selStart = dom.mainTextArea.selectionStart;
    const selEnd = dom.mainTextArea.selectionEnd;

    // Calcolo riga e colonna
    const textBeforeCursor = text.substring(0, selStart);
    const lines = textBeforeCursor.split('\n');
    const curLine = lines.length;
    const curCol = lines[lines.length - 1].length + 1;

    dom.statusCursor.textContent = `Ln ${curLine}, Col ${curCol}`;

    const totalChars = text.length;
    const selectedChars = Math.abs(selEnd - selStart);

    if (selectedChars > 0) {
      dom.statusChars.textContent = `${totalChars} caratteri (${selectedChars} selezionati)`;
    } else {
      dom.statusChars.textContent = `${totalChars} caratteri`;
    }

    dom.statusLineEnding.textContent =
      tab.lineEnding === 'CRLF'
        ? 'Windows (CRLF)'
        : tab.lineEnding === 'LF'
        ? 'Unix (LF)'
        : 'Mac (CR)';

    dom.statusEncoding.textContent = tab.encoding || 'UTF-8';
    dom.statusZoom.textContent = `${state.settings.zoomLevel}%`;
  }

  // --- TROVA E SOSTITUISCI (FindReplaceDialog) ---
  function openFind(replaceMode = false) {
    dom.findReplaceBar.classList.remove('hidden');
    if (replaceMode) {
      dom.replaceRow.classList.remove('hidden');
    }

    const selectedText = dom.mainTextArea.value.substring(
      dom.mainTextArea.selectionStart,
      dom.mainTextArea.selectionEnd
    );
    if (selectedText && !selectedText.includes('\n')) {
      dom.findInput.value = selectedText;
    }

    dom.findInput.focus();
    dom.findInput.select();
    executeSearch();
  }

  function closeFind() {
    dom.findReplaceBar.classList.add('hidden');
    dom.mainTextArea.focus();
  }

  function executeSearch(direction = 'next') {
    const query = dom.findInput.value;
    state.findState.query = query;

    if (!query) {
      state.findState.matches = [];
      state.findState.activeMatchIndex = -1;
      dom.findMatchesCount.textContent = '0 di 0';
      return;
    }

    const text = dom.mainTextArea.value;
    const isMatchCase = dom.chkMatchCase.checked;
    const isWholeWord = dom.chkWholeWord.checked;
    const isRegex = dom.chkRegex.checked;

    let regex;
    try {
      let pattern = query;
      if (!isRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      if (isWholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      regex = new RegExp(pattern, isMatchCase ? 'g' : 'gi');
    } catch (e) {
      dom.findMatchesCount.textContent = 'Regex non valida';
      return;
    }

    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length });
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }

    state.findState.matches = matches;

    if (matches.length === 0) {
      state.findState.activeMatchIndex = -1;
      dom.findMatchesCount.textContent = 'Nessun risultato';
      return;
    }

    const cursor = dom.mainTextArea.selectionStart;

    if (direction === 'next') {
      let idx = matches.findIndex((m) => m.start >= cursor);
      if (idx === -1) {
        idx = dom.chkWrapAround.checked ? 0 : matches.length - 1;
      }
      state.findState.activeMatchIndex = idx;
    } else {
      let idx = -1;
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].end <= cursor) {
          idx = i;
          break;
        }
      }
      if (idx === -1) {
        idx = dom.chkWrapAround.checked ? matches.length - 1 : 0;
      }
      state.findState.activeMatchIndex = idx;
    }

    dom.findMatchesCount.textContent = `${state.findState.activeMatchIndex + 1} di ${matches.length}`;
    highlightCurrentMatch();
  }

  function highlightCurrentMatch() {
    const match = state.findState.matches[state.findState.activeMatchIndex];
    if (match) {
      dom.mainTextArea.focus();
      dom.mainTextArea.setSelectionRange(match.start, match.end);
    }
  }

  function replaceSingle() {
    if (state.findState.matches.length === 0 || state.findState.activeMatchIndex === -1) {
      executeSearch('next');
      return;
    }

    const match = state.findState.matches[state.findState.activeMatchIndex];
    const replacement = dom.replaceInput.value;

    const currentText = dom.mainTextArea.value;
    dom.mainTextArea.value =
      currentText.substring(0, match.start) + replacement + currentText.substring(match.end);

    dom.mainTextArea.setSelectionRange(match.start, match.start + replacement.length);
    handleEditorInput();
    executeSearch('next');
  }

  function replaceAll() {
    const query = dom.findInput.value;
    if (!query) return;

    executeSearch('next');
    const matches = state.findState.matches;
    if (matches.length === 0) return;

    const isMatchCase = dom.chkMatchCase.checked;
    const isWholeWord = dom.chkWholeWord.checked;
    const isRegex = dom.chkRegex.checked;
    const replacement = dom.replaceInput.value;

    let pattern = query;
    if (!isRegex) pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (isWholeWord) pattern = `\\b${pattern}\\b`;

    const regex = new RegExp(pattern, isMatchCase ? 'g' : 'gi');
    dom.mainTextArea.value = dom.mainTextArea.value.replace(regex, replacement);

    handleEditorInput();
    executeSearch('next');
  }

  // --- VAI A RIGA (GotoDialog) ---
  function openGotoDialog() {
    const lines = dom.mainTextArea.value.split('\n');
    const totalLines = lines.length;

    dom.gotoLineLabel.textContent = `Numero di riga (1 - ${totalLines}):`;
    dom.gotoLineInput.max = totalLines;
    dom.gotoLineInput.value = 1;

    dom.gotoModal.classList.remove('hidden');
    dom.gotoLineInput.focus();
    dom.gotoLineInput.select();
  }

  function executeGoto() {
    const targetLine = parseInt(dom.gotoLineInput.value, 10);
    const lines = dom.mainTextArea.value.split('\n');

    if (!isNaN(targetLine) && targetLine >= 1 && targetLine <= lines.length) {
      let charIndex = 0;
      for (let i = 0; i < targetLine - 1; i++) {
        charIndex += lines[i].length + 1; // +1 per il newline
      }
      dom.mainTextArea.focus();
      dom.mainTextArea.setSelectionRange(charIndex, charIndex);
      updateStatusBar();
    }
    dom.gotoModal.classList.add('hidden');
  }

  // --- INSERIMENTO DATA E ORA (F5) ---
  function insertDateTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const timestamp = `${hours}:${minutes} ${day}/${month}/${year}`;
    const start = dom.mainTextArea.selectionStart;
    const end = dom.mainTextArea.selectionEnd;

    const val = dom.mainTextArea.value;
    dom.mainTextArea.value = val.substring(0, start) + timestamp + val.substring(end);
    dom.mainTextArea.setSelectionRange(start + timestamp.length, start + timestamp.length);

    handleEditorInput();
    dom.mainTextArea.focus();
  }

  // --- ZOOM ---
  function setZoom(level) {
    state.settings.zoomLevel = Math.min(500, Math.max(20, level));
    applyEditorStyles();
    updateStatusBar();
    saveSettings();
  }

  // --- EVENTI EDITOR ---
  function handleEditorInput() {
    const tab = getActiveTab();
    if (!tab) return;

    if (!tab.isDirty) {
      tab.isDirty = true;
      renderTabs();
      updateTitle();
    }
    tab.content = dom.mainTextArea.value;
    updateStatusBar();
    saveSession();
  }

  dom.mainTextArea.addEventListener('input', handleEditorInput);
  dom.mainTextArea.addEventListener('click', updateStatusBar);
  dom.mainTextArea.addEventListener('keyup', updateStatusBar);

  // Supporto tasto Tab per indentazione pulita
  dom.mainTextArea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = dom.mainTextArea.selectionStart;
      const end = dom.mainTextArea.selectionEnd;

      dom.mainTextArea.value =
        dom.mainTextArea.value.substring(0, start) + '\t' + dom.mainTextArea.value.substring(end);
      dom.mainTextArea.selectionStart = dom.mainTextArea.selectionEnd = start + 1;
      handleEditorInput();
    }
  });

  // --- GESTIONE MENU A TENDINA ---
  function closeAllMenus() {
    dom.menuItems.forEach((m) => m.classList.remove('active'));
  }

  dom.menuItems.forEach((menuItem) => {
    const btn = menuItem.querySelector('.menu-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = menuItem.classList.contains('active');
      closeAllMenus();
      if (!isActive) menuItem.classList.add('active');
    });

    menuItem.addEventListener('mouseenter', () => {
      const anyActive = Array.from(dom.menuItems).some((m) => m.classList.contains('active'));
      if (anyActive) {
        closeAllMenus();
        menuItem.classList.add('active');
      }
    });
  });

  window.addEventListener('click', () => {
    closeAllMenus();
  });

  // Azioni Menu
  document.querySelectorAll('.menu-entry[data-action]').forEach((entry) => {
    entry.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      handleMenuAction(entry.dataset.action);
    });
  });

  function handleMenuAction(action) {
    switch (action) {
      case 'new-tab':
        createNewTab();
        break;
      case 'new-window':
        window.open(window.location.href, '_blank');
        break;
      case 'open-file':
        openFile();
        break;
      case 'save-file':
        saveFile();
        break;
      case 'save-as':
        saveFileAs();
        break;
      case 'save-all':
        saveAll();
        break;
      case 'page-setup':
        alert('Configurazione pagina: Orientamento Verticale, Margini 20mm.');
        break;
      case 'print':
        window.print();
        break;
      case 'close-tab':
        if (state.activeTabId) closeTab(state.activeTabId);
        break;
      case 'close-window':
        window.close();
        break;
      case 'undo':
        document.execCommand('undo');
        break;
      case 'redo':
        document.execCommand('redo');
        break;
      case 'cut':
        document.execCommand('cut');
        break;
      case 'copy':
        document.execCommand('copy');
        break;
      case 'paste':
        navigator.clipboard
          .readText()
          .then((clipText) => {
            const start = dom.mainTextArea.selectionStart;
            const end = dom.mainTextArea.selectionEnd;
            dom.mainTextArea.value =
              dom.mainTextArea.value.substring(0, start) + clipText + dom.mainTextArea.value.substring(end);
            dom.mainTextArea.setSelectionRange(start + clipText.length, start + clipText.length);
            handleEditorInput();
          })
          .catch(() => document.execCommand('paste'));
        break;
      case 'delete':
        const start = dom.mainTextArea.selectionStart;
        const end = dom.mainTextArea.selectionEnd;
        if (start !== end) {
          dom.mainTextArea.value =
            dom.mainTextArea.value.substring(0, start) + dom.mainTextArea.value.substring(end);
          dom.mainTextArea.setSelectionRange(start, start);
          handleEditorInput();
        }
        break;
      case 'find':
        openFind(false);
        break;
      case 'find-next':
        executeSearch('next');
        break;
      case 'find-prev':
        executeSearch('prev');
        break;
      case 'replace':
        openFind(true);
        break;
      case 'goto':
        openGotoDialog();
        break;
      case 'select-all':
        dom.mainTextArea.select();
        break;
      case 'insert-datetime':
        insertDateTime();
        break;
      case 'open-font-settings':
        openSettingsModal();
        break;
      case 'zoom-in':
        setZoom(state.settings.zoomLevel + 10);
        break;
      case 'zoom-out':
        setZoom(state.settings.zoomLevel - 10);
        break;
      case 'zoom-reset':
        setZoom(100);
        break;
      case 'toggle-statusbar':
        state.settings.statusBar = !state.settings.statusBar;
        applyEditorStyles();
        saveSettings();
        break;
      case 'toggle-wordwrap':
        state.settings.wordWrap = !state.settings.wordWrap;
        applyEditorStyles();
        saveSettings();
        break;
      case 'open-about':
        dom.aboutModal.classList.remove('hidden');
        break;
    }
  }

  // --- SCORCIATOIE DA TASTIERA GLOBALI ---
  window.addEventListener('keydown', (e) => {
    // Esci da modali con Escape
    if (e.key === 'Escape') {
      if (!dom.findReplaceBar.classList.contains('hidden')) {
        closeFind();
        return;
      }
      dom.gotoModal.classList.add('hidden');
      dom.aboutModal.classList.add('hidden');
      dom.settingsModal.classList.add('hidden');
      return;
    }

    if (e.key === 'F5') {
      e.preventDefault();
      insertDateTime();
      return;
    }

    if (e.key === 'F3') {
      e.preventDefault();
      executeSearch(e.shiftKey ? 'prev' : 'next');
      return;
    }

    if (e.ctrlKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 't':
          e.preventDefault();
          createNewTab();
          break;
        case 'w':
          e.preventDefault();
          if (state.activeTabId) closeTab(state.activeTabId);
          break;
        case 'o':
          e.preventDefault();
          openFile();
          break;
        case 's':
          e.preventDefault();
          if (e.shiftKey) saveFileAs();
          else saveFile();
          break;
        case 'f':
          e.preventDefault();
          openFind(false);
          break;
        case 'h':
          e.preventDefault();
          openFind(true);
          break;
        case 'g':
          e.preventDefault();
          openGotoDialog();
          break;
        case 'p':
          e.preventDefault();
          window.print();
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoom(state.settings.zoomLevel + 10);
          break;
        case '-':
          e.preventDefault();
          setZoom(state.settings.zoomLevel - 10);
          break;
        case '0':
          e.preventDefault();
          setZoom(100);
          break;
      }
    }
  });

  // --- EVENTI CONTROLLI FIND & REPLACE ---
  dom.findInput.addEventListener('input', () => executeSearch('next'));
  dom.findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch(e.shiftKey ? 'prev' : 'next');
    }
  });

  dom.btnFindNext.addEventListener('click', () => executeSearch('next'));
  dom.btnFindPrev.addEventListener('click', () => executeSearch('prev'));
  dom.btnCloseFind.addEventListener('click', closeFind);

  dom.btnToggleReplaceMode.addEventListener('click', () => {
    dom.replaceRow.classList.toggle('hidden');
    if (!dom.replaceRow.classList.contains('hidden')) {
      dom.replaceInput.focus();
    }
  });

  dom.btnReplaceSingle.addEventListener('click', replaceSingle);
  dom.btnReplaceAll.addEventListener('click', replaceAll);

  [dom.chkMatchCase, dom.chkWholeWord, dom.chkRegex, dom.chkWrapAround].forEach((chk) => {
    chk.addEventListener('change', () => executeSearch('next'));
  });

  // --- EVENTI MODALI GOTO & ABOUT ---
  dom.btnGotoConfirm.addEventListener('click', executeGoto);
  dom.btnGotoCancel.addEventListener('click', () => dom.gotoModal.classList.add('hidden'));
  dom.gotoLineInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeGoto();
  });

  dom.btnAboutClose.addEventListener('click', () => dom.aboutModal.classList.add('hidden'));

  // --- EVENTI IMPOSTAZIONI ---
  dom.btnSettings.addEventListener('click', openSettingsModal);
  dom.btnSettingsClose.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));
  dom.btnSettingsDone.addEventListener('click', () => dom.settingsModal.classList.add('hidden'));

  function openSettingsModal() {
    dom.fontFamilySelect.value = state.settings.fontFamily;
    dom.fontSizeSelect.value = String(state.settings.fontSize);
    dom.settingsWordWrapToggle.checked = state.settings.wordWrap;
    dom.lblWordWrapSwitch.textContent = state.settings.wordWrap ? 'Attivato' : 'Disattivato';

    const radioTheme = document.querySelector(`input[name="appTheme"][value="${state.settings.theme}"]`);
    if (radioTheme) radioTheme.checked = true;

    const radioStartup = document.querySelector(
      `input[name="startupBehavior"][value="${state.settings.startupBehavior}"]`
    );
    if (radioStartup) radioStartup.checked = true;

    updateFontPreview();
    dom.settingsModal.classList.remove('hidden');
  }

  function updateFontPreview() {
    dom.fontPreviewBox.style.fontFamily = dom.fontFamilySelect.value;
    dom.fontPreviewBox.style.fontSize = `${dom.fontSizeSelect.value}pt`;
  }

  document.querySelectorAll('input[name="appTheme"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  });

  document.querySelectorAll('input[name="startupBehavior"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      state.settings.startupBehavior = e.target.value;
      saveSettings();
    });
  });

  dom.fontFamilySelect.addEventListener('change', (e) => {
    state.settings.fontFamily = e.target.value;
    updateFontPreview();
    applyEditorStyles();
    saveSettings();
  });

  dom.fontSizeSelect.addEventListener('change', (e) => {
    state.settings.fontSize = parseInt(e.target.value, 10);
    updateFontPreview();
    applyEditorStyles();
    saveSettings();
  });

  dom.settingsWordWrapToggle.addEventListener('change', (e) => {
    state.settings.wordWrap = e.target.checked;
    dom.lblWordWrapSwitch.textContent = state.settings.wordWrap ? 'Attivato' : 'Disattivato';
    applyEditorStyles();
    saveSettings();
  });

  // --- CLICK SU STATUS BAR INTERATTIVA ---
  dom.statusZoom.addEventListener('click', () => setZoom(100));

  dom.statusLineEnding.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const endings = ['CRLF', 'LF', 'CR'];
    const nextIdx = (endings.indexOf(tab.lineEnding) + 1) % endings.length;
    tab.lineEnding = endings[nextIdx];
    tab.isDirty = true;
    renderTabs();
    updateTitle();
    updateStatusBar();
    saveSession();
  });

  dom.statusEncoding.addEventListener('click', () => {
    const tab = getActiveTab();
    if (!tab) return;
    const encodings = ['UTF-8', 'UTF-8 con BOM', 'UTF-16 LE', 'ANSI'];
    const nextIdx = (encodings.indexOf(tab.encoding) + 1) % encodings.length;
    tab.encoding = encodings[nextIdx];
    tab.isDirty = true;
    renderTabs();
    updateTitle();
    updateStatusBar();
    saveSession();
  });

  dom.btnNewTab.addEventListener('click', () => createNewTab());

  // --- AVVIO DELL'APPLICAZIONE ---
  function init() {
    loadSettings();
    applyTheme(state.settings.theme);
    applyEditorStyles();

    const restored = loadSession();
    if (!restored) {
      createNewTab('Documento 1', '');
    } else {
      renderTabs();
      switchTab(state.activeTabId || state.tabs[0].id);
    }
  }

  init();
})();
