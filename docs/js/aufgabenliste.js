/**
 * Focus Web – Aufgaben anlegen & bearbeiten.
 * Enthält das "Neue Aufgabe"-Popup (ausgelöst über den +-Button auf dem
 * Dashboard) und das Bearbeiten-Popup (ausgelöst durch Klick auf eine
 * Aufgabe im Dashboard). Entspricht ViewModels/AufgabeEingebenViewModel.cs
 * und AufgabenDetailsViewModel.cs.
 */

const Aufgabenliste = {
  _checklisteEntwurf: [],

  init() {
    this._wireNeueAufgabePopup();
    this._wireDetailsPopupSchliessen();
  },

  // ---------------------------------------------------------------
  // Neue Aufgabe (Popup über +-Button auf dem Dashboard)
  // ---------------------------------------------------------------

  _wireNeueAufgabePopup() {
    document.getElementById("dashboard-fab-neue-aufgabe").addEventListener("click", () => this.oeffneNeueAufgabePopup());

    document.getElementById("neue-aufgabe-popup-close").addEventListener("click", () => this.schliesseNeueAufgabePopup());
    document.getElementById("neue-aufgabe-abbrechen-btn").addEventListener("click", () => this.schliesseNeueAufgabePopup());
    document.getElementById("neue-aufgabe-popup").addEventListener("click", (e) => {
      if (e.target.id === "neue-aufgabe-popup") this.schliesseNeueAufgabePopup();
    });

    const bereichSelect = document.getElementById("neu-bereich");
    const projektSelect = document.getElementById("neu-projekt");
    bereichSelect.addEventListener("change", () => this._ladeProjektOptionen(bereichSelect.value, projektSelect));

    document.getElementById("neue-aufgabe-form").addEventListener("submit", (e) => {
      e.preventDefault();

      const titel = document.getElementById("neu-titel").value.trim();
      const projektId = projektSelect.value;

      if (!titel) {
        Anzeige.zeigeToast("Titel ist erforderlich.", true);
        return;
      }

      if (!projektId) {
        Anzeige.zeigeToast("Bitte zuerst in den Einstellungen ein Projekt für diesen Bereich anlegen.", true);
        return;
      }

      try {
        Store.addOrUpdateAufgabe({
          Id: "",
          Titel: titel,
          ProjektId: projektId,
          Prioritaet: document.getElementById("neu-prioritaet").value,
          Status: AufgabenStatus.Offen,
          Faelligkeit: document.getElementById("neu-faelligkeit").value || null,
          Notizen: document.getElementById("neu-notizen").value.trim(),
          Link: "",
          Checkliste: [],
        });

        Anzeige.zeigeToast("Aufgabe erstellt!");
        this.schliesseNeueAufgabePopup();
      } catch (err) {
        Anzeige.zeigeToast(err.message, true);
      }
    });
  },

  oeffneNeueAufgabePopup() {
    document.getElementById("neu-titel").value = "";
    document.getElementById("neu-notizen").value = "";
    document.getElementById("neu-faelligkeit").value = "";
    document.getElementById("neu-prioritaet").value = Prioritaet.P3Normal;
    this._ladeFormBereichOptionen();
    document.getElementById("neue-aufgabe-popup").hidden = false;
    document.getElementById("neu-titel").focus();
  },

  schliesseNeueAufgabePopup() {
    document.getElementById("neue-aufgabe-popup").hidden = true;
  },

  _ladeFormBereichOptionen() {
    const bereichSelect = document.getElementById("neu-bereich");
    const bereiche = Store.getBereiche();

    bereichSelect.innerHTML = bereiche.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");

    if (bereiche.length > 0) {
      this._ladeProjektOptionen(bereichSelect.value, document.getElementById("neu-projekt"));
    } else {
      document.getElementById("neu-projekt").innerHTML = "";
    }
  },

  _ladeProjektOptionen(bereich, projektSelect) {
    const projekte = bereich ? Store.getProjekte(bereich) : [];
    projektSelect.innerHTML = projekte.map((p) => `<option value="${p.Id}">${escapeHtml(p.Name)}</option>`).join("");
  },

  // ---------------------------------------------------------------
  // Aktionen ohne eigenes Popup
  // ---------------------------------------------------------------

  _duplizieren(aufgabe) {
    Store.addOrUpdateAufgabe({
      Id: "",
      Titel: `${aufgabe.Titel} (Kopie)`,
      ProjektId: aufgabe.ProjektId,
      Prioritaet: aufgabe.Prioritaet,
      Status: AufgabenStatus.Offen,
      Faelligkeit: aufgabe.Faelligkeit,
      Notizen: aufgabe.Notizen,
      Link: aufgabe.Link,
      Checkliste: (aufgabe.Checkliste || []).map((c) => ({ Id: neueId(), Text: c.Text, Erledigt: c.Erledigt })),
    });
    Anzeige.zeigeToast("Aufgabe dupliziert.");
  },

  // ---------------------------------------------------------------
  // Bearbeiten-Popup (vom Dashboard aus genutzt, App.oeffneDetails)
  // ---------------------------------------------------------------

  _wireDetailsPopupSchliessen() {
    // Schließen-Button/Overlay-Klick werden bereits in app.js verdrahtet
    // (App.schliesseDetails). Hier ist nichts weiter nötig.
  },

  oeffneBearbeitenPopup(aufgabeId) {
    const aufgabe = Store.getAufgaben().find((a) => a.Id === aufgabeId);
    if (!aufgabe) return;

    this._checklisteEntwurf = (aufgabe.Checkliste || []).map((c) => ({ ...c }));

    document.querySelector("#details-popup .popup__header h2").textContent = "Aufgabe bearbeiten";
    this._renderPopupInhalt(aufgabe);

    document.getElementById("details-popup").hidden = false;
  },

  _renderPopupInhalt(aufgabe) {
    const body = document.getElementById("details-popup-body");
    const bereiche = Store.getBereiche();
    const aktuellerBereich = aufgabe.Bereich || bereiche[0] || "";

    body.innerHTML = `
      <div class="form-field">
        <label for="edit-titel">Titel</label>
        <input type="text" id="edit-titel" class="form-input" value="${escapeHtml(aufgabe.Titel)}" />
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="edit-bereich">Bereich</label>
          <select id="edit-bereich" class="form-input">
            ${bereiche.map((b) => `<option value="${escapeHtml(b)}" ${b === aktuellerBereich ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label for="edit-projekt">Projekt</label>
          <select id="edit-projekt" class="form-input"></select>
        </div>
      </div>
      <div class="form-field">
        <label>Priorität</label>
        <div class="chip-list" id="edit-prioritaet-chips"></div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="edit-status">Status</label>
          <select id="edit-status" class="form-input">
            <option value="Offen">Offen</option>
            <option value="InArbeit">In Arbeit</option>
            <option value="Erledigt">Erledigt</option>
          </select>
        </div>
        <div class="form-field">
          <label for="edit-faelligkeit">Fälligkeit</label>
          <input type="date" id="edit-faelligkeit" class="form-input" value="${aufgabe.Faelligkeit || ""}" />
        </div>
      </div>
      <div class="form-field">
        <label for="edit-notizen">Notizen</label>
        <textarea id="edit-notizen" class="form-input" rows="3">${escapeHtml(aufgabe.Notizen || "")}</textarea>
      </div>
      <div class="form-field">
        <label for="edit-link">Link</label>
        <input type="text" id="edit-link" class="form-input" value="${escapeHtml(aufgabe.Link || "")}" placeholder="https://…" />
      </div>

      <div class="form-field">
        <label>Checkliste</label>
        <div id="edit-checkliste-liste"></div>
        <div class="checkliste-add-row">
          <input type="text" id="edit-checkliste-neu" class="form-input" placeholder="Neuer Punkt…" />
          <button type="button" id="edit-checkliste-add-btn" class="btn-secondary">+</button>
        </div>
      </div>

      <div class="popup-footer">
        <button type="button" id="edit-speichern-btn" class="btn-primary">Speichern</button>
        <button type="button" id="edit-duplizieren-btn" class="btn-secondary">Duplizieren</button>
        <button type="button" id="edit-abbrechen-btn" class="btn-secondary">Abbrechen</button>
        <button type="button" id="edit-loeschen-btn" class="btn-danger">Löschen</button>
      </div>
    `;

    document.getElementById("edit-status").value = aufgabe.Status;

    this._renderPrioritaetChips(aufgabe.Prioritaet);
    this._renderChecklisteEntwurf();

    const bereichSelect = document.getElementById("edit-bereich");
    const projektSelect = document.getElementById("edit-projekt");
    const ladeProjekte = () => {
      const projekte = Store.getProjekte(bereichSelect.value);
      projektSelect.innerHTML = projekte.map((p) => `<option value="${p.Id}" ${p.Id === aufgabe.ProjektId ? "selected" : ""}>${escapeHtml(p.Name)}</option>`).join("");
    };
    bereichSelect.addEventListener("change", ladeProjekte);
    ladeProjekte();

    document.getElementById("edit-checkliste-add-btn").addEventListener("click", () => {
      const input = document.getElementById("edit-checkliste-neu");
      if (!input.value.trim()) return;
      this._checklisteEntwurf.push({ Id: neueId(), Text: input.value.trim(), Erledigt: false });
      input.value = "";
      this._renderChecklisteEntwurf();
    });

    document.getElementById("edit-speichern-btn").addEventListener("click", () => this._speichern(aufgabe.Id));
    document.getElementById("edit-abbrechen-btn").addEventListener("click", () => App.schliesseDetails());

    document.getElementById("edit-duplizieren-btn").addEventListener("click", () => {
      this._duplizieren(aufgabe);
      App.schliesseDetails();
    });

    document.getElementById("edit-loeschen-btn").addEventListener("click", () => {
      if (!window.confirm(`Aufgabe "${aufgabe.Titel}" wirklich endgültig löschen?`)) return;
      Store.endgueltigLoeschen(aufgabe.Id);
      Anzeige.zeigeToast("Aufgabe gelöscht.");
      App.schliesseDetails();
    });
  },

  _renderPrioritaetChips(aktuellePrioritaet) {
    const container = document.getElementById("edit-prioritaet-chips");
    container.innerHTML = "";

    for (const prio of PRIORITAET_REIHENFOLGE) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (prio === aktuellePrioritaet ? " is-selected" : "");
      btn.textContent = Anzeige.prioritaetText(prio);
      btn.dataset.prioritaet = prio;
      btn.addEventListener("click", () => {
        container.querySelectorAll(".chip").forEach((c) => c.classList.remove("is-selected"));
        btn.classList.add("is-selected");
      });
      container.appendChild(btn);
    }
  },

  _renderChecklisteEntwurf() {
    const container = document.getElementById("edit-checkliste-liste");
    container.innerHTML = "";

    if (this._checklisteEntwurf.length === 0) {
      container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 13px;">Noch keine Punkte.</p>`;
      return;
    }

    for (const eintrag of this._checklisteEntwurf) {
      const row = document.createElement("div");
      row.className = "checkliste-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = eintrag.Erledigt;
      checkbox.addEventListener("change", () => {
        eintrag.Erledigt = checkbox.checked;
        span.classList.toggle("is-erledigt", eintrag.Erledigt);
      });

      const span = document.createElement("span");
      span.textContent = eintrag.Text;
      span.className = eintrag.Erledigt ? "is-erledigt" : "";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-icon";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        this._checklisteEntwurf = this._checklisteEntwurf.filter((e) => e.Id !== eintrag.Id);
        this._renderChecklisteEntwurf();
      });

      row.appendChild(checkbox);
      row.appendChild(span);
      row.appendChild(removeBtn);
      container.appendChild(row);
    }
  },

  _speichern(aufgabeId) {
    const titel = document.getElementById("edit-titel").value.trim();
    if (!titel) {
      Anzeige.zeigeToast("Titel ist erforderlich.", true);
      return;
    }

    const projektId = document.getElementById("edit-projekt").value;
    if (!projektId) {
      Anzeige.zeigeToast("Projekt ist erforderlich.", true);
      return;
    }

    const prioritaetChip = document.querySelector("#edit-prioritaet-chips .chip.is-selected");
    const prioritaet = prioritaetChip ? prioritaetChip.dataset.prioritaet : Prioritaet.P3Normal;

    try {
      Store.addOrUpdateAufgabe({
        Id: aufgabeId,
        Titel: titel,
        ProjektId: projektId,
        Prioritaet: prioritaet,
        Status: document.getElementById("edit-status").value,
        Faelligkeit: document.getElementById("edit-faelligkeit").value || null,
        Notizen: document.getElementById("edit-notizen").value.trim(),
        Link: document.getElementById("edit-link").value.trim(),
        Checkliste: this._checklisteEntwurf,
      });

      Anzeige.zeigeToast("Aufgabe gespeichert.");
      App.schliesseDetails();
    } catch (err) {
      Anzeige.zeigeToast(err.message, true);
    }
  },
};
