/**
 * Focus Web – Einstellungen.
 * Entspricht ViewModels/EinstellungenViewModel.cs: Bereiche & Projekte
 * verwalten, Bereichsfarben (geräteweise), Darstellung, Daten sichern.
 */

const Einstellungen = {
  ausgewaehlterBereich: "",
  ausgewaehltesProjektId: "",
  ausgewaehlteFarbe: "",

  FARB_OPTIONEN: [
    { name: "Standard", hex: "" },
    { name: "Blau", hex: "#E3F2FD" },
    { name: "Grün", hex: "#E8F5E9" },
    { name: "Orange", hex: "#FFF3E0" },
    { name: "Violett", hex: "#F3E5F5" },
    { name: "Rot", hex: "#FFEBEE" },
    { name: "Türkis", hex: "#E0F7FA" },
    { name: "Grau", hex: "#F5F5F5" },
  ],

  init() {
    document.addEventListener("focus:datenGeaendert", () => this.render());
    this._wireBereiche();
    this._wireProjekte();
    this._wireFarben();
    this._wireAufgabenAufraeumen();
    this._wireDaten();
    this.render();
  },

  render() {
    if (!Store._daten) return;
    this._renderBereichSelect();
    this._renderProjektSelect();
    this._renderFarbOptionen();
    this._renderDarkModeOptionen();
  },

  // ---------------------------------------------------------------
  // Bereiche
  // ---------------------------------------------------------------

  _wireBereiche() {
    document.getElementById("einst-bereich-select").addEventListener("change", (e) => {
      this.ausgewaehlterBereich = e.target.value;
      this.ausgewaehltesProjektId = "";
      this.render();
    });

    document.getElementById("einst-bereich-hinzufuegen-btn").addEventListener("click", () => {
      const name = document.getElementById("einst-neuer-bereich").value.trim();
      if (!name) return;

      Store.addBereich(name);
      document.getElementById("einst-neuer-bereich").value = "";
      this.ausgewaehlterBereich = name;
      Anzeige.zeigeToast("Bereich angelegt.");
      this.render();
    });

    document.getElementById("einst-bereich-umbenennen-btn").addEventListener("click", () => {
      const neu = document.getElementById("einst-bereich-umbenennen").value.trim();
      if (!neu || !this.ausgewaehlterBereich) return;

      try {
        Store.renameBereich(this.ausgewaehlterBereich, neu);
        LokaleEinstellungen.renameBereichFarbe(this.ausgewaehlterBereich, neu);
        this.ausgewaehlterBereich = neu;
        Anzeige.zeigeToast("Bereich umbenannt.");
        this.render();
      } catch (err) {
        Anzeige.zeigeToast(err.message, true);
      }
    });

    document.getElementById("einst-bereich-loeschen-btn").addEventListener("click", () => {
      if (!this.ausgewaehlterBereich) return;
      if (!window.confirm(`Bereich "${this.ausgewaehlterBereich}" wirklich löschen?`)) return;

      try {
        Store.deleteBereich(this.ausgewaehlterBereich);
        LokaleEinstellungen.removeBereichFarbe(this.ausgewaehlterBereich);
        this.ausgewaehlterBereich = "";
        Anzeige.zeigeToast("Bereich gelöscht.");
        this.render();
      } catch (err) {
        Anzeige.zeigeToast(err.message, true);
      }
    });
  },

  _renderBereichSelect() {
    const select = document.getElementById("einst-bereich-select");
    const bereiche = Store.getBereiche();

    if (!bereiche.includes(this.ausgewaehlterBereich)) {
      this.ausgewaehlterBereich = bereiche[0] || "";
    }

    select.innerHTML = bereiche
      .map((b) => `<option value="${escapeHtml(b)}" ${b === this.ausgewaehlterBereich ? "selected" : ""}>${escapeHtml(b)}</option>`)
      .join("");

    document.getElementById("einst-bereich-umbenennen").value = this.ausgewaehlterBereich;
  },

  // ---------------------------------------------------------------
  // Projekte
  // ---------------------------------------------------------------

  _wireProjekte() {
    document.getElementById("einst-projekt-select").addEventListener("change", (e) => {
      this.ausgewaehltesProjektId = e.target.value;
      const projekt = Store.getProjekte(this.ausgewaehlterBereich).find((p) => p.Id === this.ausgewaehltesProjektId);
      document.getElementById("einst-projekt-umbenennen").value = projekt ? projekt.Name : "";
    });

    document.getElementById("einst-projekt-hinzufuegen-btn").addEventListener("click", () => {
      const name = document.getElementById("einst-neues-projekt").value.trim();
      if (!name) return;
      if (!this.ausgewaehlterBereich) {
        Anzeige.zeigeToast("Bitte zuerst einen Bereich auswählen.", true);
        return;
      }

      try {
        const projekt = Store.addProjekt(this.ausgewaehlterBereich, name);
        document.getElementById("einst-neues-projekt").value = "";
        this.ausgewaehltesProjektId = projekt.Id;
        Anzeige.zeigeToast("Projekt angelegt.");
        this.render();
      } catch (err) {
        Anzeige.zeigeToast(err.message, true);
      }
    });

    document.getElementById("einst-projekt-umbenennen-btn").addEventListener("click", () => {
      if (!this.ausgewaehltesProjektId) {
        Anzeige.zeigeToast("Bitte ein Projekt auswählen.", true);
        return;
      }

      const neu = document.getElementById("einst-projekt-umbenennen").value.trim();
      if (!neu) return;

      try {
        Store.renameProjekt(this.ausgewaehltesProjektId, neu);
        Anzeige.zeigeToast("Projekt umbenannt.");
        this.render();
      } catch (err) {
        Anzeige.zeigeToast(err.message, true);
      }
    });

    document.getElementById("einst-projekt-loeschen-btn").addEventListener("click", () => {
      if (!this.ausgewaehltesProjektId) {
        Anzeige.zeigeToast("Bitte ein Projekt auswählen.", true);
        return;
      }

      const projekt = Store.getProjekte(this.ausgewaehlterBereich).find((p) => p.Id === this.ausgewaehltesProjektId);
      const anzahlAufgaben = Store.getAufgaben().filter((a) => a.ProjektId === this.ausgewaehltesProjektId).length;

      const nachricht = anzahlAufgaben > 0
        ? `Projekt "${projekt?.Name}" wirklich löschen? ${anzahlAufgaben} zugehörige Aufgabe(n) werden dabei ebenfalls endgültig gelöscht.`
        : `Projekt "${projekt?.Name}" wirklich löschen?`;

      if (!window.confirm(nachricht)) return;

      Store.deleteProjekt(this.ausgewaehltesProjektId);
      this.ausgewaehltesProjektId = "";
      Anzeige.zeigeToast("Projekt gelöscht.");
      this.render();
    });
  },

  _renderProjektSelect() {
    const select = document.getElementById("einst-projekt-select");
    const projekte = Store.getProjekte(this.ausgewaehlterBereich);

    if (!projekte.some((p) => p.Id === this.ausgewaehltesProjektId)) {
      this.ausgewaehltesProjektId = projekte[0]?.Id || "";
    }

    select.innerHTML = projekte
      .map((p) => `<option value="${p.Id}" ${p.Id === this.ausgewaehltesProjektId ? "selected" : ""}>${escapeHtml(p.Name)}</option>`)
      .join("");

    const aktuelles = projekte.find((p) => p.Id === this.ausgewaehltesProjektId);
    document.getElementById("einst-projekt-umbenennen").value = aktuelles ? aktuelles.Name : "";
  },

  // ---------------------------------------------------------------
  // Bereichsfarben (geräteweise, siehe LokaleEinstellungen in store.js)
  // ---------------------------------------------------------------

  _wireFarben() {
    document.getElementById("einst-farbe-speichern-btn").addEventListener("click", () => {
      if (!this.ausgewaehlterBereich) {
        Anzeige.zeigeToast("Bitte einen Bereich auswählen.", true);
        return;
      }

      LokaleEinstellungen.setBereichFarbe(this.ausgewaehlterBereich, this.ausgewaehlteFarbe);
      Anzeige.zeigeToast("Bereichsfarbe gespeichert.");
      // Alle Listen (Dashboard, Aufgabenliste, Bereichsansicht) sofort mit der neuen Farbe neu zeichnen.
      document.dispatchEvent(new CustomEvent("focus:datenGeaendert"));
    });
  },

  _renderFarbOptionen() {
    const container = document.getElementById("einst-farbe-optionen");
    const gespeichert = LokaleEinstellungen.getBereichFarbe(this.ausgewaehlterBereich);
    this.ausgewaehlteFarbe = gespeichert || "";

    container.innerHTML = "";
    for (const option of this.FARB_OPTIONEN) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip farbe-chip" + (option.hex === this.ausgewaehlteFarbe ? " is-selected" : "");
      btn.textContent = option.name;
      if (option.hex) btn.style.background = option.hex;
      btn.addEventListener("click", () => {
        this.ausgewaehlteFarbe = option.hex;
        container.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
      container.appendChild(btn);
    }
  },

  // ---------------------------------------------------------------
  // Darstellung (Dark Mode, geräteweise)
  // ---------------------------------------------------------------

  _renderDarkModeOptionen() {
    const container = document.getElementById("einst-darkmode-optionen");
    const aktuelle = LokaleEinstellungen.getDarkMode();

    const optionen = [
      { value: null, label: "System" },
      { value: "light", label: "Hell" },
      { value: "dark", label: "Dunkel" },
    ];

    container.innerHTML = "";
    for (const option of optionen) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (option.value === aktuelle ? " is-selected" : "");
      btn.textContent = option.label;
      btn.addEventListener("click", () => {
        LokaleEinstellungen.setDarkMode(option.value);
        this._renderDarkModeOptionen();
      });
      container.appendChild(btn);
    }
  },

  // ---------------------------------------------------------------
  // Aufgaben aufräumen (erledigte Aufgaben endgültig löschen)
  // ---------------------------------------------------------------

  _wireAufgabenAufraeumen() {
    document.getElementById("einst-erledigte-loeschen-btn").addEventListener("click", () => {
      const anzahl = Store.getAufgaben().filter((a) => a.Status === AufgabenStatus.Erledigt).length;

      if (anzahl === 0) {
        Anzeige.zeigeToast("Keine erledigten Aufgaben vorhanden.");
        return;
      }

      if (!window.confirm(`${anzahl} erledigte Aufgabe(n) wirklich endgültig löschen?`)) return;

      const geloescht = Store.loescheErledigteAufgaben();
      Anzeige.zeigeToast(`${geloescht} erledigte Aufgabe(n) gelöscht.`);
    });
  },

  // ---------------------------------------------------------------
  // Daten sichern (Export/Import, kompatibel zur aufgaben.json der App)
  // ---------------------------------------------------------------

  _wireDaten() {
    document.getElementById("einst-export-btn").addEventListener("click", () => {
      const json = Store.exportJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `aufgaben-${heuteIso()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    document.getElementById("einst-import-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (!window.confirm("Import ersetzt alle aktuellen Aufgaben, Projekte und Bereiche durch den Inhalt der Datei. Fortfahren?")) {
        e.target.value = "";
        return;
      }

      try {
        const text = await file.text();
        Store.importJson(text);
        Anzeige.zeigeToast("Daten importiert.");
        this.render();
      } catch (err) {
        Anzeige.zeigeToast("Import fehlgeschlagen: " + err.message, true);
      } finally {
        e.target.value = "";
      }
    });
  },
};
