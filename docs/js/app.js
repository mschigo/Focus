/**
 * Focus Web – Navigation, Login-Ablauf & Bootstrap.
 */

let tempNeueCheckliste = [];

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
      document.getElementById("login-error").textContent = "Verbindung zu Supabase fehlgeschlagen: " + err.message;
    }
  },

  _wireAllgemeineUi() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        this.wechsleTab(btn.dataset.tab);
      });
    });

    document.getElementById("details-popup-close").addEventListener("click", () => this.schliesseDetails());
    document.getElementById("details-popup").addEventListener("click", (e) => {
      if (e.target.id === "details-popup") this.schliesseDetails();
    });

    document.getElementById("logout-btn").addEventListener("click", async () => {
      await Store.abmelden();
    });
  },

  _wireNeueAufgabeForm() {
    // Button auf Dashboard öffnet Popup
    document.getElementById("dashboard-fab-neue-aufgabe")?.addEventListener("click", () => {
      document.getElementById("neue-aufgabe-form").reset();
      document.getElementById("neu-link").value = "";
      tempNeueCheckliste = [];
      this._renderNeueCheckliste();

      const bereiche = Store.getBereiche();
      const bereichSelect = document.getElementById("neu-bereich");
      bereichSelect.innerHTML = bereiche.map(b => `<option value="${b}">${escapeHtml(b)}</option>`).join("");

      this._updateNeuProjektDropdown();

      document.getElementById("neue-aufgabe-popup").hidden = false;
      document.getElementById("neu-titel").focus();
    });

    // Bereichsänderung aktualisiert Projekt-Dropdown
    document.getElementById("neu-bereich")?.addEventListener("change", () => this._updateNeuProjektDropdown());

    // Schließen / Abbrechen Handlers
    const schliessePopup = () => {
      document.getElementById("neue-aufgabe-popup").hidden = true;
    };
    document.getElementById("neue-aufgabe-popup-close")?.addEventListener("click", schliessePopup);
    document.getElementById("neue-aufgabe-abbrechen-btn")?.addEventListener("click", schliessePopup);

    // Checklistenpunkt hinzufügen Button
    document.getElementById("neu-checkliste-add-btn")?.addEventListener("click", () => {
      const input = document.getElementById("neu-checkliste-input");
      const text = input.value.trim();
      if (text) {
        tempNeueCheckliste.push({ Id: crypto.randomUUID(), Text: text, IstErledigt: false });
        input.value = "";
        this._renderNeueCheckliste();
      }
    });

    // Enter-Taste im Checklisten-Input abfangen
    document.getElementById("neu-checkliste-input")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("neu-checkliste-add-btn").click();
      }
    });

    // Formular Absenden
    document.getElementById("neue-aufgabe-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const titel = document.getElementById("neu-titel").value.trim();
      if (!titel) return;

      const neueAufgabe = {
        Id: crypto.randomUUID(),
        Titel: titel,
        Bereich: document.getElementById("neu-bereich").value,
        ProjektName: document.getElementById("neu-projekt").value,
        Prioritaet: document.getElementById("neu-prioritaet").value,
        Faelligkeit: document.getElementById("neu-faelligkeit").value || null,
        Notizen: document.getElementById("neu-notizen").value || "",
        Link: document.getElementById("neu-link").value || "",
        Status: "Offen",
        Checkliste: tempNeueCheckliste,
        ErstelltAm: new Date().toISOString(),
        GeaendertAm: new Date().toISOString(),
        IstAktiv: true
      };

      await Store.addAufgabe(neueAufgabe);
      if (typeof Toast !== "undefined") Toast.show("Aufgabe erstellt.");
      schliessePopup();
    });
  },

  _updateNeuProjektDropdown() {
    const bereich = document.getElementById("neu-bereich").value;
    const projekte = Store.getProjekte(bereich);
    const projektSelect = document.getElementById("neu-projekt");

    if (projekte.length === 0) {
      projektSelect.innerHTML = `<option value="Allgemein">Allgemein</option>`;
    } else {
      projektSelect.innerHTML = projekte.map(p => `<option value="${p.Name}">${escapeHtml(p.Name)}</option>`).join("");
    }
  },

  _renderNeueCheckliste() {
    const container = document.getElementById("neu-checkliste-container");
    container.innerHTML = "";

    if (tempNeueCheckliste.length === 0) {
      container.innerHTML = `<span style="font-size: 13px; color: var(--color-text-muted);">Noch keine Punkte.</span>`;
      return;
    }

    tempNeueCheckliste.forEach((punkt, index) => {
      const row = document.createElement("div");
      row.className = "checkliste-item";
      row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 4px 0;";
      row.innerHTML = `
        <span style="font-size: 13px;">${escapeHtml(punkt.Text)}</span>
        <button type="button" class="icon-btn" title="Löschen" data-index="${index}">✕</button>
      `;

      row.querySelector("button").addEventListener("click", (e) => {
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

    modusToggle.addEventListener("click", (e) => {
      e.preventDefault();
      modus = modus === "signin" ? "signup" : "signin";
      submitBtn.textContent = modus === "signin" ? "Anmelden" : "Konto erstellen";
      modusToggle.textContent = modus === "signin" ? "Neu hier? Konto erstellen" : "Bereits ein Konto? Anmelden";
      fehlerEl.textContent = "";
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const passwort = document.getElementById("login-passwort").value;
      fehlerEl.textContent = "";
      submitBtn.disabled = true;

      try {
        if (modus === "signin") {
          await Store.anmelden(email, passwort);
        } else {
          await Store.registrieren(email, passwort);
          fehlerEl.style.color = "";
          fehlerEl.textContent = "Konto erstellt. Falls E-Mail-Bestätigung aktiv ist, bitte den Link in der Mail bestätigen und dich danach anmelden.";
        }
      } catch (err) {
        fehlerEl.style.color = "var(--color-p1)";
        fehlerEl.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
      }
    });
  },

  _zeigeLoginScreen() {
    document.getElementById("loading-screen").hidden = true;
    document.getElementById("app-shell").hidden = true;
    document.getElementById("login-screen").hidden = false;
  },

  _zeigeAppShell() {
    document.getElementById("loading-screen").hidden = true;
    document.getElementById("login-screen").hidden = true;
    document.getElementById("app-shell").hidden = false;
  },

  wechsleTab(tab) {
    document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.tab === tab));
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `view-${tab}`));
  },

  oeffneDetails(aufgabeId) {
    Aufgabenliste.oeffneBearbeitenPopup(aufgabeId);
  },

  schliesseDetails() {
    document.getElementById("details-popup").hidden = true;
  },
};

document.addEventListener("DOMContentLoaded", () => App.init());
