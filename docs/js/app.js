/**
 * Focus Web – Navigation, Login-Ablauf & Bootstrap.
 */

let tempNeueCheckliste = [];
let tempNeueLinks = [""];
let tempNeueZeitbuchungen = [];

// Lokale Hilfsfunktionen als Fallback
function appEscapeHtml(text) {
  if (typeof escapeHtml === "function") return escapeHtml(text);
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function appNeueId() {
  if (typeof neueId === "function") return neueId();
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const App = {
  _viewsInitialisiert: false,

  async init() {
    this._wireLoginForm();
    this._wireAllgemeineUi();
    this._wireNeueAufgabeForm();

    Store.onAuthChange((eingeloggt) => {
      if (eingeloggt) {
        this._zeigeAppShell();

        if (!this._viewsInitialisiert) {
          this._viewsInitialisiert = true;
          Dashboard.init();
          Aufgabenliste.init();
          Einstellungen.init();

          // Direktlink von gantt.html/zeitauswertung.html, z. B. "#einstellungen".
          const hashTab = (location.hash || "").replace("#", "");
          if (hashTab === "einstellungen") this.wechsleTab(hashTab);
        } else {
          Dashboard.render();
          Einstellungen.render();
        }
      } else {
        this._zeigeLoginScreen();
      }
    });

    try {
      await Store.starteAuthUeberwachung();
    } catch (err) {
      console.error("Focus: Fehler beim Start.", err);
      this._zeigeLoginScreen();
      const fehlerEl = document.getElementById("login-error");
      if (fehlerEl) fehlerEl.textContent = "Verbindung zu Supabase fehlgeschlagen: " + err.message;
    }
  },

  _wireAllgemeineUi() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        this.wechsleTab(btn.dataset.tab);
      });
    });

    document.getElementById("details-popup-close")?.addEventListener("click", () => this.schliesseDetails());
    document.getElementById("details-popup")?.addEventListener("click", (e) => {
      if (e.target.id === "details-popup") this.schliesseDetails();
    });

    document.getElementById("logout-btn")?.addEventListener("click", async () => {
      await Store.abmelden();
    });
  },

  _wireNeueAufgabeForm() {
    let startManuellGeaendert = false;
    let faelligManuellGeaendert = false;

    const startEl = document.getElementById("neu-startdatum");
    const faelligEl = document.getElementById("neu-faelligkeit");

    if (startEl && faelligEl) {
      startEl.addEventListener("input", () => {
        startManuellGeaendert = true;
        if (!faelligManuellGeaendert || !faelligEl.value) {
          faelligEl.value = startEl.value;
        }
      });

      faelligEl.addEventListener("input", () => {
        faelligManuellGeaendert = true;
        if (!startManuellGeaendert || !startEl.value) {
          startEl.value = faelligEl.value;
        }
      });
    }

    // Button auf Dashboard öffnet Popup
    document.getElementById("dashboard-fab-neue-aufgabe")?.addEventListener("click", () => {
      document.getElementById("neue-aufgabe-form").reset();
      
      startManuellGeaendert = false;
      faelligManuellGeaendert = false;

      tempNeueLinks = [""];
      const linksContainer = document.getElementById("neu-links-container");
      if (linksContainer) Linkfelder.render(linksContainer, tempNeueLinks, () => {});

      const sollEl = document.getElementById("neu-sollzeit");
      if (sollEl) sollEl.value = "";

      tempNeueZeitbuchungen = [];
      const zeitContainer = document.getElementById("neu-zeitbuchungen-container");
      if (zeitContainer) Zeiterfassung.render(zeitContainer, tempNeueZeitbuchungen, () => {});

      if (startEl) startEl.value = "";
      if (faelligEl) faelligEl.value = "";

      tempNeueCheckliste = [];
      this._renderNeueCheckliste();

      const bereiche = Store.getBereiche();
      const bereichSelect = document.getElementById("neu-bereich");
      if (bereichSelect) {
        bereichSelect.innerHTML = bereiche.map(b => `<option value="${appEscapeHtml(b)}">${appEscapeHtml(b)}</option>`).join("");

        // Aktiven Dashboard-Filter (Bereich) übernehmen, falls einer gesetzt ist.
        if (typeof Dashboard !== "undefined" && Dashboard.ausgewaehlterBereich !== "Alle") {
          const passenderBereich = bereiche.find(
            (b) => b.toLowerCase() === Dashboard.ausgewaehlterBereich.toLowerCase()
          );
          if (passenderBereich) bereichSelect.value = passenderBereich;
        }
      }

      this._updateNeuProjektDropdown();

      // Aktiven Dashboard-Filter (Projekt) übernehmen, falls einer gesetzt ist
      // und zum gewählten Bereich passt.
      if (typeof Dashboard !== "undefined" && Dashboard.ausgewaehltesProjekt !== "Alle") {
        const projektSelect = document.getElementById("neu-projekt");
        const passendesProjekt = projektSelect
          ? [...projektSelect.options].find(
              (o) => o.value.toLowerCase() === Dashboard.ausgewaehltesProjekt.toLowerCase()
            )
          : null;
        if (passendesProjekt) projektSelect.value = passendesProjekt.value;
      }

      const popup = document.getElementById("neue-aufgabe-popup");
      if (popup) popup.hidden = false;
      document.getElementById("neu-titel")?.focus();
    });

    // Bereichsänderung aktualisiert Projekt-Dropdown
    document.getElementById("neu-bereich")?.addEventListener("change", () => this._updateNeuProjektDropdown());

    // Schließen / Abbrechen Handlers
    const schliessePopup = () => {
      const popup = document.getElementById("neue-aufgabe-popup");
      if (popup) popup.hidden = true;
    };
    document.getElementById("neue-aufgabe-popup-close")?.addEventListener("click", schliessePopup);
    document.getElementById("neue-aufgabe-abbrechen-btn")?.addEventListener("click", schliessePopup);

    // Checklistenpunkt hinzufügen Button
    document.getElementById("neu-checkliste-add-btn")?.addEventListener("click", () => {
      const input = document.getElementById("neu-checkliste-input");
      if (!input) return;
      const text = input.value.trim();
      if (text) {
        tempNeueCheckliste.push({
          Id: appNeueId(),
          Titel: text,
          IstErledigt: false
        });
        input.value = "";
        this._renderNeueCheckliste();
      }
    });

    // Enter-Taste im Checklisten-Input abfangen
    document.getElementById("neu-checkliste-input")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("neu-checkliste-add-btn")?.click();
      }
    });

    // Formular Absenden
    document.getElementById("neue-aufgabe-form")?.addEventListener("submit", (e) => {
      e.preventDefault();

      const titel = document.getElementById("neu-titel")?.value.trim();
      if (!titel) return;

      const bereich = document.getElementById("neu-bereich")?.value;
      const projektName = document.getElementById("neu-projekt")?.value;

      let projekte = Store.getProjekte(bereich);
      let projekt = projekte.find(p => p.Name === projektName);

      if (!projekt) {
        try {
          projekt = Store.addProjekt(bereich, projektName || "Allgemein");
        } catch (err) {
          projekte = Store.getProjekte(bereich);
          projekt = projekte[0];
        }
      }

      if (!projekt) {
        if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Ungültiges Projekt gewählt.", true);
        return;
      }

      // Falls Enddatum gesetzt ist aber Startdatum fehlt, wird Startdatum gleich Enddatum gesetzt
      let finalStart = document.getElementById("neu-startdatum")?.value || null;
      let finalFaellig = document.getElementById("neu-faelligkeit")?.value || null;
      if (finalFaellig && !finalStart) finalStart = finalFaellig;
      if (finalStart && !finalFaellig) finalFaellig = finalStart;

      const neueAufgabe = {
        Id: appNeueId(),
        Titel: titel,
        ProjektId: projekt.Id,
        Prioritaet: document.getElementById("neu-prioritaet")?.value || Prioritaet.P3Normal,
        Startdatum: finalStart,
        Faelligkeit: finalFaellig,
        Notizen: document.getElementById("neu-notizen")?.value || "",
        Links: tempNeueLinks.map((l) => l.trim()).filter(Boolean),
        SollZeit: parseFloat(document.getElementById("neu-sollzeit")?.value) || 0,
        Zeitbuchungen: tempNeueZeitbuchungen.map((z) => ({ ...z })),
        Status: AufgabenStatus.Offen,
        Checkliste: [...tempNeueCheckliste],
      };

      try {
        Store.addOrUpdateAufgabe(neueAufgabe);
        tempNeueCheckliste = [];
        tempNeueLinks = [""];
        tempNeueZeitbuchungen = [];
        if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Aufgabe erstellt.");
        schliessePopup();
      } catch (err) {
        console.error("Fehler beim Speichern der Aufgabe:", err);
        if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Fehler: " + err.message, true);
      }
    });
  },

  _updateNeuProjektDropdown() {
    const bereichEl = document.getElementById("neu-bereich");
    if (!bereichEl) return;
    const bereich = bereichEl.value;
    const projekte = Store.getProjekte(bereich);
    const projektSelect = document.getElementById("neu-projekt");

    if (!projektSelect) return;

    if (projekte.length === 0) {
      projektSelect.innerHTML = `<option value="Allgemein">Allgemein</option>`;
    } else {
      projektSelect.innerHTML = projekte.map(p => `<option value="${appEscapeHtml(p.Name)}">${appEscapeHtml(p.Name)}</option>`).join("");
    }
  },

  _renderNeueCheckliste() {
    const container = document.getElementById("neu-checkliste-container");
    if (!container) return;
    container.innerHTML = "";

    if (tempNeueCheckliste.length === 0) {
      container.innerHTML = `<span style="font-size: 13px; color: var(--color-text-muted);">Noch keine Punkte.</span>`;
      return;
    }

    tempNeueCheckliste.forEach((punkt, index) => {
      const row = document.createElement("div");
      row.className = "checkliste-item";
      row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 4px 0;";

      const punktText = punkt.Titel || punkt.Text || punkt.text || "";

      row.innerHTML = `
        <span style="font-size: 13px;">${appEscapeHtml(punktText)}</span>
        <button type="button" class="icon-btn" title="Löschen" data-index="${index}">✕</button>
      `;

      row.querySelector("button")?.addEventListener("click", (e) => {
        const idx = e.target.getAttribute("data-index");
        tempNeueCheckliste.splice(idx, 1);
        this._renderNeueCheckliste();
      });

      container.appendChild(row);
    });
  },

  _wireLoginForm() {
    const form = document.getElementById("login-form");
    const modusToggle = document.getElementById("login-modus-toggle");
    const submitBtn = document.getElementById("login-submit-btn");
    const fehlerEl = document.getElementById("login-error");
    let modus = "signin";

    if (!form || !modusToggle || !submitBtn) return;

    modusToggle.addEventListener("click", (e) => {
      e.preventDefault();
      modus = modus === "signin" ? "signup" : "signin";
      submitBtn.textContent = modus === "signin" ? "🔐 Anmelden" : "🆕 Konto erstellen";
      modusToggle.textContent = modus === "signin" ? "👤 Neu hier? Konto erstellen" : "🔐 Bereits ein Konto? Anmelden";
      if (fehlerEl) fehlerEl.textContent = "";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email")?.value.trim();
      const passwort = document.getElementById("login-passwort")?.value;
      if (fehlerEl) fehlerEl.textContent = "";
      submitBtn.disabled = true;

      try {
        if (modus === "signin") {
          await Store.anmelden(email, passwort);
        } else {
          await Store.registrieren(email, passwort);
          if (fehlerEl) {
            fehlerEl.style.color = "";
            fehlerEl.textContent = "Konto erstellt. Falls E-Mail-Bestätigung aktiv ist, bitte den Link in der Mail bestätigen und dich danach anmelden.";
          }
        }
      } catch (err) {
        if (fehlerEl) {
          fehlerEl.style.color = "var(--color-p1)";
          fehlerEl.textContent = err.message;
        }
      } finally {
        submitBtn.disabled = false;
      }
    });
  },

  _zeigeLoginScreen() {
    const loading = document.getElementById("loading-screen");
    const appShell = document.getElementById("app-shell");
    const login = document.getElementById("login-screen");

    if (loading) loading.hidden = true;
    if (appShell) appShell.hidden = true;
    if (login) login.hidden = false;
  },

  _zeigeAppShell() {
    const loading = document.getElementById("loading-screen");
    const appShell = document.getElementById("app-shell");
    const login = document.getElementById("login-screen");

    if (loading) loading.hidden = true;
    if (login) login.hidden = true;
    if (appShell) appShell.hidden = false;
  },

  wechsleTab(tab) {
    if (!tab) return;
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${tab}`));

    // Hash mitführen, damit Links von gantt.html/zeitauswertung.html (z. B.
    // "index.html#einstellungen") den richtigen Tab öffnen und ein Reload
    // auf demselben Tab bleibt.
    if (window.history?.replaceState) {
      window.history.replaceState(null, "", `#${tab}`);
    }
  },

  oeffneDetails(aufgabeId) {
    if (typeof Aufgabenliste !== "undefined") {
      Aufgabenliste.oeffneBearbeitenPopup(aufgabeId);
    }
  },

  schliesseDetails() {
    const popup = document.getElementById("details-popup");
    if (popup) popup.hidden = true;
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
