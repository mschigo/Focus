/**
 * Focus Web – Navigation, Login-Ablauf & Bootstrap.
 */

const App = {
  async init() {
    this._wireLoginForm();
    this._wireAllgemeineUi();

    Store.onAuthChange((eingeloggt) => {
      if (eingeloggt) {
        this._zeigeAppShell();
        Dashboard.init();
        Aufgabenliste.init();
        Einstellungen.init();
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

  /** Öffnet das Bearbeiten-Popup (Dashboard und Aufgabenliste nutzen dasselbe Popup). */
  oeffneDetails(aufgabeId) {
    Aufgabenliste.oeffneBearbeitenPopup(aufgabeId);
  },

  schliesseDetails() {
    document.getElementById("details-popup").hidden = true;
  },
};

// escapeHtml() ist bereits in dashboard.js definiert und global verfügbar.

document.addEventListener("DOMContentLoaded", () => App.init());
