/**
 * Focus Web – Aufgabenliste.
 * Entspricht ViewModels/AufgabenlisteViewModel.cs + AufgabenDetailsViewModel.cs:
 * Filter, Anlegen-Formular, Liste mit Mehrfachauswahl/Bulk-Aktionen, sowie das
 * Bearbeiten-Popup (auch vom Dashboard aus genutzt).
 */

const Aufgabenliste = {
  filterBereich: "Alle",
  filterStatus: "Alle",
  filterFaelligkeit: "Alle",
  filterText: "",
  ausgewaehlt: new Set(),
  _sucheTimer: null,
  _bearbeiteId: null,
  _checklisteEntwurf: [],

  init() {
    document.addEventListener("focus:datenGeaendert", () => this.render());

    this._wireNeueAufgabeForm();
    this._wireFilter();
    this._wireBulkLeiste();

    this.render();
  },

  // ---------------------------------------------------------------
  // Neue Aufgabe
  // ---------------------------------------------------------------

  _wireNeueAufgabeForm() {
    const bereichSelect = document.getElementById("neu-bereich");
    const projektSelect = document.getElementById("neu-projekt");
    const faelligkeitInput = document.getElementById("neu-faelligkeit");

    faelligkeitInput.value = heuteIso();

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
          Faelligkeit: faelligkeitInput.value || null,
          Notizen: document.getElementById("neu-notizen").value.trim(),
          Link: "",
          Checkliste: [],
        });

        Anzeige.zeigeToast("Aufgabe erstellt!");
        document.getElementById("neu-titel").value = "";
        document.getElementById("neu-notizen").value = "";
        faelligkeitInput.value = heuteIso();
      } catch (err) {
        Anzeige.zeigeToast(err.message, true);
      }
    });

    this._ladeFormBereichOptionen();
  },

  _ladeFormBereichOptionen() {
    const bereichSelect = document.getElementById("neu-bereich");
    const bereiche = Store.getBereiche();

    bereichSelect.innerHTML = bereiche.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");

    if (bereiche.length > 0) {
      this._ladeProjektOptionen(bereichSelect.value, document.getElementById("neu-projekt"));
    }
  },

  _ladeProjektOptionen(bereich, projektSelect) {
    const projekte = bereich ? Store.getProjekte(bereich) : [];
    projektSelect.innerHTML = projekte.map((p) => `<option value="${p.Id}">${escapeHtml(p.Name)}</option>`).join("");
  },

  // ---------------------------------------------------------------
  // Filter
  // ---------------------------------------------------------------

  _wireFilter() {
    document.getElementById("aufgabenliste-suche").addEventListener("input", (e) => {
      clearTimeout(this._sucheTimer);
      const value = e.target.value;
      this._sucheTimer = setTimeout(() => {
        this.filterText = value;
        this.render();
      }, 300);
    });
  },

  _setBereichFilter(value) {
    this.filterBereich = value;
    this.render();
  },

  _setStatusFilter(value) {
    this.filterStatus = value;
    this.render();
  },

  _setFaelligkeitFilter(value) {
    this.filterFaelligkeit = value;
    this.render();
  },

  _renderFilterChips(bereiche) {
    this._renderChipGroup("aufgabenliste-bereich-filter", ["Alle", ...bereiche], this.filterBereich, (v) => this._setBereichFilter(v));
    this._renderChipGroup("aufgabenliste-status-filter", ["Alle", "Offen", "InArbeit", "Erledigt"], this.filterStatus, (v) => this._setStatusFilter(v), {
      Alle: "Alle", Offen: "Offen", InArbeit: "In Arbeit", Erledigt: "Erledigt",
    });
    this._renderChipGroup("aufgabenliste-faelligkeit-filter", ["Alle", "Heute", "Diese Woche", "Überfällig"], this.filterFaelligkeit, (v) => this._setFaelligkeitFilter(v));
  },

  _renderChipGroup(containerId, optionen, aktiv, onClick, labels = null) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    for (const option of optionen) {
      const btn = document.createElement("button");
      btn.className = "chip" + (option === aktiv ? " is-selected" : "");
      btn.textContent = labels ? labels[option] : option;
      btn.addEventListener("click", () => onClick(option));
      container.appendChild(btn);
    }
  },

  _gefiltertUndSortiert(aufgaben) {
    let query = aufgaben;

    if (this.filterBereich !== "Alle") {
      query = query.filter((a) => (a.Bereich || "").toLowerCase() === this.filterBereich.toLowerCase());
    }

    if (this.filterText.trim()) {
      const t = this.filterText.trim().toLowerCase();
      query = query.filter((a) => a.Titel.toLowerCase().includes(t) || (a.ProjektName || "").toLowerCase().includes(t));
    }

    if (this.filterStatus !== "Alle") {
      query = query.filter((a) => a.Status === this.filterStatus);
    }

    const heute = heuteIso();
    const wochenEnde = wochenEndeIso(heute);

    query = query.filter((a) => {
      switch (this.filterFaelligkeit) {
        case "Heute": return a.Faelligkeit === heute;
        case "Diese Woche": return a.Faelligkeit && a.Faelligkeit >= heute && a.Faelligkeit <= wochenEnde;
        case "Überfällig": return a.Faelligkeit && a.Faelligkeit < heute;
        default: return true;
      }
    });

    return [...query].sort((a, b) => {
      const prioA = PRIORITAET_REIHENFOLGE.indexOf(a.Prioritaet);
      const prioB = PRIORITAET_REIHENFOLGE.indexOf(b.Prioritaet);
      if (prioA !== prioB) return prioA - prioB;

      const faelA = a.Faelligkeit || "9999-12-31";
      const faelB = b.Faelligkeit || "9999-12-31";
      if (faelA !== faelB) return faelA.localeCompare(faelB);

      return (b.GeaendertAm || "").localeCompare(a.GeaendertAm || "");
    });
  },

  // ---------------------------------------------------------------
  // Rendern der Liste
  // ---------------------------------------------------------------

  render() {
    if (!Store._daten) return; // Noch nicht eingeloggt/geladen.

    const bereiche = Store.getBereiche();
    this._renderFilterChips(bereiche);

    if (document.getElementById("neu-bereich").options.length === 0 && bereiche.length > 0) {
      this._ladeFormBereichOptionen();
    }

    const alle = Store.getAufgaben();
    const gefiltert = this._gefiltertUndSortiert(alle);

    // Auswahl bereinigen (Einträge, die durch den Filter verschwunden sind, verlieren die Auswahl nicht,
    // Einträge, die gelöscht wurden, schon).
    const alleIds = new Set(alle.map((a) => a.Id));
    for (const id of this.ausgewaehlt) {
      if (!alleIds.has(id)) this.ausgewaehlt.delete(id);
    }

    document.getElementById("aufgabenliste-anzahl").textContent = `${gefiltert.length} Aufgabe(n)`;

    const alleAuswaehlenCheckbox = document.getElementById("aufgabenliste-alle-auswaehlen");
    alleAuswaehlenCheckbox.checked = gefiltert.length > 0 && gefiltert.every((a) => this.ausgewaehlt.has(a.Id));
    alleAuswaehlenCheckbox.onchange = () => {
      for (const a of gefiltert) {
        if (alleAuswaehlenCheckbox.checked) this.ausgewaehlt.add(a.Id);
        else this.ausgewaehlt.delete(a.Id);
      }
      this.render();
    };

    const container = document.getElementById("aufgabenliste-items");
    container.innerHTML = "";

    if (gefiltert.length === 0) {
      container.innerHTML = `<p class="hinweis-box">Keine Aufgaben gefunden.</p>`;
    } else {
      for (const aufgabe of gefiltert) {
        container.appendChild(this._renderItem(aufgabe));
      }
    }

    this._renderBulkLeiste();
  },

  _renderItem(aufgabe) {
    const row = document.createElement("div");
    row.className = "liste-item";

    const heute = heuteIso();
    const istUeberfaellig = aufgabe.Faelligkeit && aufgabe.Faelligkeit < heute && aufgabe.IstAktiv;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.ausgewaehlt.has(aufgabe.Id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) this.ausgewaehlt.add(aufgabe.Id);
      else this.ausgewaehlt.delete(aufgabe.Id);
      this._renderBulkLeiste();
      document.getElementById("aufgabenliste-alle-auswaehlen").checked = false;
    });
    row.appendChild(checkbox);

    const main = document.createElement("div");
    main.className = "liste-item__main";
    main.addEventListener("click", () => this.oeffneBearbeitenPopup(aufgabe.Id));
    main.innerHTML = `
      <span class="badge ${Anzeige.prioritaetBadgeClass(aufgabe.Prioritaet)}">${Anzeige.prioritaetText(aufgabe.Prioritaet)}</span>
      <span class="aufgabe-row__titel ${aufgabe.Status === AufgabenStatus.Erledigt ? "is-erledigt" : ""}" style="display:inline;">${escapeHtml(aufgabe.Titel)}</span>
      <div class="aufgabe-row__meta">
        ${escapeHtml(aufgabe.Bereich || "")}${aufgabe.ProjektName ? " · " + escapeHtml(aufgabe.ProjektName) : ""}
        ${aufgabe.Faelligkeit ? ` · <span class="${istUeberfaellig ? "is-ueberfaellig" : ""}">${Anzeige.faelligkeitText(aufgabe.Faelligkeit)}</span>` : ""}
      </div>
    `;
    row.appendChild(main);

    const aktionen = document.createElement("div");
    aktionen.className = "liste-item__aktionen";

    const statusSelect = document.createElement("select");
    statusSelect.className = "status-select";
    statusSelect.innerHTML = `
      <option value="Offen" ${aufgabe.Status === "Offen" ? "selected" : ""}>Offen</option>
      <option value="InArbeit" ${aufgabe.Status === "InArbeit" ? "selected" : ""}>In Arbeit</option>
      <option value="Erledigt" ${aufgabe.Status === "Erledigt" ? "selected" : ""}>Erledigt</option>
    `;
    statusSelect.addEventListener("change", () => {
      Store.setAufgabenStatus(aufgabe.Id, statusSelect.value);
      Anzeige.zeigeToast("Status aktualisiert.");
    });
    aktionen.appendChild(statusSelect);

    const duplizierenBtn = document.createElement("button");
    duplizierenBtn.className = "btn-icon";
    duplizierenBtn.title = "Duplizieren";
    duplizierenBtn.textContent = "⧉";
    duplizierenBtn.addEventListener("click", () => this._duplizieren(aufgabe));
    aktionen.appendChild(duplizierenBtn);

    const loeschenBtn = document.createElement("button");
    loeschenBtn.className = "btn-icon";
    loeschenBtn.title = "Löschen";
    loeschenBtn.textContent = "🗑";
    loeschenBtn.addEventListener("click", () => this._loeschenMitBestaetigung([aufgabe.Id], aufgabe.Titel));
    aktionen.appendChild(loeschenBtn);

    row.appendChild(aktionen);

    return row;
  },

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

  _loeschenMitBestaetigung(ids, titel) {
    const nachricht = ids.length === 1
      ? `Aufgabe "${titel}" wirklich endgültig löschen?`
      : `${ids.length} Aufgabe(n) wirklich endgültig löschen?`;

    if (!window.confirm(nachricht)) return;

    for (const id of ids) {
      Store.endgueltigLoeschen(id);
      this.ausgewaehlt.delete(id);
    }

    Anzeige.zeigeToast(ids.length === 1 ? "Aufgabe gelöscht." : "Ausgewählte Aufgaben gelöscht.");
  },

  // ---------------------------------------------------------------
  // Bulk-Leiste
  // ---------------------------------------------------------------

  _wireBulkLeiste() {
    document.getElementById("aufgabenliste-bulk-status-btn").addEventListener("click", () => {
      const status = document.getElementById("aufgabenliste-bulk-status").value;
      for (const id of this.ausgewaehlt) {
        Store.setAufgabenStatus(id, status);
      }
      Anzeige.zeigeToast("Status für ausgewählte Aufgaben geändert.");
      this.ausgewaehlt.clear();
      this.render();
    });

    document.getElementById("aufgabenliste-bulk-loeschen-btn").addEventListener("click", () => {
      this._loeschenMitBestaetigung([...this.ausgewaehlt]);
      this.render();
    });
  },

  _renderBulkLeiste() {
    const bar = document.getElementById("aufgabenliste-bulk-bar");
    const anzahl = this.ausgewaehlt.size;

    bar.hidden = anzahl === 0;
    if (anzahl > 0) {
      document.getElementById("aufgabenliste-bulk-anzahl").textContent = `${anzahl} ausgewählt`;
    }
  },

  // ---------------------------------------------------------------
  // Bearbeiten-Popup (auch vom Dashboard aus genutzt)
  // ---------------------------------------------------------------

  oeffneBearbeitenPopup(aufgabeId) {
    const aufgabe = Store.getAufgaben().find((a) => a.Id === aufgabeId);
    if (!aufgabe) return;

    this._bearbeiteId = aufgabe.Id;
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
