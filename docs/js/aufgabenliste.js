/**
 * Focus Web – Bearbeiten-Popup & Aufgabenverwaltung.
 */

const Aufgabenliste = {
  _checklisteEntwurf: [],
  _linksEntwurf: [],
  _zeitbuchungenEntwurf: [],

  init() {
    this._wireDetailsPopupSchliessen();
  },

  _wireDetailsPopupSchliessen() {
    // Schließen wird über App.schliesseDetails bzw. Klick auf Close-Btn erledigt
  },

  // ---------------------------------------------------------------
  // Bearbeiten-Popup (vom Dashboard aus über App.oeffneDetails gerufen)
  // ---------------------------------------------------------------

  oeffneBearbeitenPopup(aufgabeId) {
    const aufgabe = Store.getAufgaben().find((a) => a.Id === aufgabeId);
    if (!aufgabe) return;

    // Checkliste als Kopie in den Entwurf übernehmen
    this._checklisteEntwurf = (aufgabe.Checkliste || []).map((c) => ({
      Id: c.Id || neueId(),
      Titel: c.Titel || c.Text || c.text || "",
      IstErledigt: c.IstErledigt || c.Erledigt || c.erledigt || false,
    }));

    this._linksEntwurf = [...(aufgabe.Links || [])];
    this._zeitbuchungenEntwurf = (aufgabe.Zeitbuchungen || []).map((z) => ({ ...z }));

    const headerTitle = document.querySelector("#details-popup .popup__header h2");
    if (headerTitle) headerTitle.textContent = "✏️ Aufgabe bearbeiten";

    this._renderPopupInhalt(aufgabe);
    const popup = document.getElementById("details-popup");
    if (popup) popup.hidden = false;
  },

  // Hilfsfunktion zum Berechnen von Ausdrücken wie "+2", "2+1", "3-0.5", "2*1.5", "4/2"
  _wertBerechnen(basisWert, eingabe) {
    if (eingabe === undefined || eingabe === null) return basisWert;
    let str = String(eingabe).trim().replace(",", ".");
    if (!str) return 0;

    // Wenn die Eingabe mit +, -, * oder / beginnt, hängen wir den Basiswert davor (z. B. "+2" -> "2+2")
    if (["+", "-", "*", "/"].includes(str.charAt(0))) {
      str = basisWert + str;
    }

    try {
      // Sichere Auswertung einfacher mathematischer Ausdrücke
      if (/^[0-9\.\+\-\*\/\s\(\)]+$/.test(str)) {
        const ergebnis = Function(`"use strict"; return (${str})`)();
        if (typeof ergebnis === "number" && !isNaN(ergebnis) && isFinite(ergebnis)) {
          return Math.max(0, Math.round(ergebnis * 100) / 100);
        }
      }
    } catch (e) {
      console.warn("Ungültiger Rechenausdruck:", str);
    }

    const direktNummer = parseFloat(str);
    return isNaN(direktNummer) ? basisWert : Math.max(0, direktNummer);
  },

  _renderPopupInhalt(aufgabe) {
    const body = document.getElementById("details-popup-body");
    if (!body) return;

    const bereiche = Store.getBereiche();
    const aktuellerBereich = aufgabe.Bereich || bereiche[0] || "";

    let aktuellerSollWert = parseFloat(aufgabe.SollZeit) || 0;

    body.innerHTML = `
      <form id="edit-aufgabe-form" class="aufgabe-form">
        <div class="form-field">
          <label for="edit-titel">Titel</label>
          <input type="text" id="edit-titel" class="form-input" value="${escapeHtml(aufgabe.Titel)}" required />
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
              <option value="Offen" ${aufgabe.Status === "Offen" ? "selected" : ""}>○ Offen</option>
              <option value="InArbeit" ${aufgabe.Status === "InArbeit" ? "selected" : ""}>⏱ In Arbeit</option>
              <option value="Erledigt" ${aufgabe.Status === "Erledigt" ? "selected" : ""}>✓ Erledigt</option>
            </select>
          </div>
          <div class="form-field">
            <label for="edit-startdatum">Startdatum (optional)</label>
            <input type="date" id="edit-startdatum" class="form-input" lang="de-CH" value="${aufgabe.Startdatum || ""}" />
          </div>
          <div class="form-field">
            <label for="edit-faelligkeit">Fälligkeit (optional)</label>
            <input type="date" id="edit-faelligkeit" class="form-input" lang="de-CH" value="${aufgabe.Faelligkeit || ""}" />
          </div>
        </div>

        <!-- Soll-Zeit: einzelne Zahl (Schätzung). Rechenausdrücke wie "+1" möglich. -->
        <div class="form-field">
          <label for="edit-sollzeit">Soll-Zeit (Std.)</label>
          <input type="text" id="edit-sollzeit" class="form-input" placeholder="z. B. 3 oder +1" value="${aktuellerSollWert || ""}" />
        </div>

        <!-- Ist-Zeit: einzelne Buchungen mit Datum, damit die Auswertung auch
             über Monatsgrenzen hinweg korrekt bleibt. -->
        <div class="form-field">
          <label>⏱ Erfasste Zeit (Ist)</label>
          <div id="edit-zeitbuchungen-container"></div>
        </div>

        <div class="form-field">
          <label for="edit-notizen">Notizen</label>
          <textarea id="edit-notizen" class="form-input" rows="3">${escapeHtml(aufgabe.Notizen || "")}</textarea>
        </div>

        <!-- Link-/Pfad-Felder (mehrere möglich, für URLs & Dateipfade) -->
        <div class="form-field">
          <label>Link / Pfad</label>
          <div id="edit-links-container"></div>
        </div>

        <div class="form-field">
          <label>Checkliste</label>
          <div id="edit-checkliste-liste"></div>
          <div class="checkliste-add-row" style="display:flex; gap:6px; margin-top:8px;">
            <input type="text" id="edit-checkliste-neu" class="form-input" placeholder="Neuer Punkt…" />
            <button type="button" id="edit-checkliste-add-btn" class="btn-secondary">+</button>
          </div>
        </div>

        <div class="popup-footer" style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
          <button type="submit" class="btn-primary">💾 Speichern</button>
          ${aufgabe.Status !== AufgabenStatus.Erledigt ? `<button type="button" id="edit-erledigt-btn" class="btn-success">✅ Erledigt</button>` : ""}
          <button type="button" id="edit-duplizieren-btn" class="btn-secondary">📄 Duplizieren</button>
          <button type="button" id="edit-abbrechen-btn" class="btn-secondary">✕ Abbrechen</button>
          <button type="button" id="edit-loeschen-btn" class="btn-danger">🗑️ Löschen</button>
        </div>
      </form>
    `;

    this._renderPrioritaetChips(aufgabe.Prioritaet);
    this._renderChecklisteEntwurf();
    Linkfelder.render(document.getElementById("edit-links-container"), this._linksEntwurf, () => {});
    Zeiterfassung.render(
      document.getElementById("edit-zeitbuchungen-container"),
      this._zeitbuchungenEntwurf,
      () => {},
      () => {
        // Enter bei Stunden/Datum: Buchung ist bereits hinzugefügt – Aufgabe
        // gleich automatisch speichern, ohne das Popup zu schließen, damit
        // bei Bedarf direkt weitere Zeit erfasst werden kann.
        const sollInputAktuell = document.getElementById("edit-sollzeit");
        if (sollInputAktuell) {
          aktuellerSollWert = this._wertBerechnen(aktuellerSollWert, sollInputAktuell.value);
        }
        this._speichern(aufgabe.Id, aktuellerSollWert, false);
      }
    );

    const bereichSelect = document.getElementById("edit-bereich");
    const projektSelect = document.getElementById("edit-projekt");

    const ladeProjekte = () => {
      const projekte = Store.getProjekte(bereichSelect.value);
      projektSelect.innerHTML = projekte
        .map((p) => `<option value="${p.Id}" ${p.Id === aufgabe.ProjektId ? "selected" : ""}>${escapeHtml(p.Name)}</option>`)
        .join("");
    };

    bereichSelect.addEventListener("change", ladeProjekte);
    ladeProjekte();

    // Automatische Auswertung beim Verlassen des Feldes (blur) oder Drücken von Enter
    const sollInput = document.getElementById("edit-sollzeit");
    if (sollInput) {
      const verarbeiteSollZeit = () => {
        aktuellerSollWert = this._wertBerechnen(aktuellerSollWert, sollInput.value);
        sollInput.value = aktuellerSollWert > 0 ? aktuellerSollWert : "";
      };

      sollInput.addEventListener("blur", verarbeiteSollZeit);
      sollInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          verarbeiteSollZeit();
        }
      });
    }

    // Automatische Synchronisation der Datumsfelder im Bearbeiten-Popup
    const editStartInput = document.getElementById("edit-startdatum");
    const editFaelligInput = document.getElementById("edit-faelligkeit");
    let editStartManuell = Boolean(aufgabe.Startdatum);
    let editFaelligManuell = Boolean(aufgabe.Faelligkeit);

    if (editStartInput && editFaelligInput) {
      editStartInput.addEventListener("input", () => {
        editStartManuell = true;
        if (!editFaelligManuell || !editFaelligInput.value) {
          editFaelligInput.value = editStartInput.value;
        }
      });

      editFaelligInput.addEventListener("input", () => {
        editFaelligManuell = true;
        if (!editStartManuell || !editStartInput.value) {
          editStartInput.value = editFaelligInput.value;
        }
      });
    }

    // Checklisten-Punkt hinzufügen
    document.getElementById("edit-checkliste-add-btn")?.addEventListener("click", () => {
      const input = document.getElementById("edit-checkliste-neu");
      if (!input || !input.value.trim()) return;
      this._checklisteEntwurf.push({ Id: neueId(), Titel: input.value.trim(), IstErledigt: false });
      input.value = "";
      this._renderChecklisteEntwurf();
    });

    document.getElementById("edit-checkliste-neu")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("edit-checkliste-add-btn")?.click();
      }
    });

    // Abbrechen
    document.getElementById("edit-abbrechen-btn")?.addEventListener("click", () => {
      App.schliesseDetails();
    });

    // Duplizieren
    document.getElementById("edit-duplizieren-btn")?.addEventListener("click", () => {
      this._duplizieren(aufgabe);
      App.schliesseDetails();
    });

    // Erledigt: Status setzen und sofort speichern – ein Klick reicht.
    document.getElementById("edit-erledigt-btn")?.addEventListener("click", () => {
      const statusSelect = document.getElementById("edit-status");
      if (statusSelect) statusSelect.value = AufgabenStatus.Erledigt;

      if (sollInput) {
        aktuellerSollWert = this._wertBerechnen(aktuellerSollWert, sollInput.value);
      }

      this._speichern(aufgabe.Id, aktuellerSollWert);
    });

    // Löschen
    document.getElementById("edit-loeschen-btn")?.addEventListener("click", () => {
      if (window.confirm(`Aufgabe "${aufgabe.Titel}" wirklich endgültig löschen?`)) {
        App.schliesseDetails();
        Store.endgueltigLoeschen(aufgabe.Id);
        if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Aufgabe gelöscht.");
      }
    });

    // Formular Absenden (Speichern)
    document.getElementById("edit-aufgabe-form")?.addEventListener("submit", (e) => {
      e.preventDefault();

      if (sollInput) {
        aktuellerSollWert = this._wertBerechnen(aktuellerSollWert, sollInput.value);
      }

      this._speichern(aufgabe.Id, aktuellerSollWert);
    });
  },

  _renderPrioritaetChips(aktuellePrioritaet) {
    const container = document.getElementById("edit-prioritaet-chips");
    if (!container) return;
    container.innerHTML = "";

    const prioritaetIcons = {
      [Prioritaet.P1Dringend]: "🔴",
      [Prioritaet.P2Wichtig]: "🟠",
      [Prioritaet.P3Normal]: "⚪",
      [Prioritaet.P4Spaeter]: "⚫",
    };

    for (const prio of PRIORITAET_REIHENFOLGE) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (prio === aktuellePrioritaet ? " is-selected" : "");
      btn.textContent = `${prioritaetIcons[prio] || ""} ${Anzeige.prioritaetText(prio)}`;
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
    if (!container) return;
    container.innerHTML = "";

    if (this._checklisteEntwurf.length === 0) {
      container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 13px;">Noch keine Punkte.</p>`;
      return;
    }

    for (const eintrag of this._checklisteEntwurf) {
      const row = document.createElement("div");
      row.className = "checkliste-item";
      row.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 4px 0;";

      const isDone = eintrag.IstErledigt || false;
      const punktText = eintrag.Titel || eintrag.Text || "";

      row.innerHTML = `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
          <input type="checkbox" class="check-toggle" ${isDone ? "checked" : ""} />
          <span class="${isDone ? "is-erledigt" : ""}">${escapeHtml(punktText)}</span>
        </label>
        <button type="button" class="btn-icon" title="Löschen">✕</button>
      `;

      row.querySelector(".check-toggle")?.addEventListener("change", (e) => {
        eintrag.IstErledigt = e.target.checked;
        row.querySelector("span")?.classList.toggle("is-erledigt", eintrag.IstErledigt);
      });

      row.querySelector(".btn-icon")?.addEventListener("click", () => {
        this._checklisteEntwurf = this._checklisteEntwurf.filter((e) => e.Id !== eintrag.Id);
        this._renderChecklisteEntwurf();
      });

      container.appendChild(row);
    }
  },

  _duplizieren(aufgabe) {
    Store.addOrUpdateAufgabe({
      Id: "",
      Titel: `${aufgabe.Titel} (Kopie)`,
      ProjektId: aufgabe.ProjektId,
      Prioritaet: aufgabe.Prioritaet,
      Status: AufgabenStatus.Offen,
      Startdatum: aufgabe.Startdatum || null,
      Faelligkeit: aufgabe.Faelligkeit || null,
      Notizen: aufgabe.Notizen,
      Links: [...(aufgabe.Links || [])],
      SollZeit: aufgabe.SollZeit || 0,
      // Zeitbuchungen bewusst NICHT übernehmen: eine Kopie ist noch nicht bearbeitet.
      Zeitbuchungen: [],
      Checkliste: (aufgabe.Checkliste || []).map((c) => ({
        Id: neueId(),
        Titel: c.Titel || c.Text || "",
        IstErledigt: c.IstErledigt || false,
      })),
    });
    if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Aufgabe dupliziert.");
  },

  _speichern(aufgabeId, sollZeit, schliessenNachSpeichern = true) {
    const titel = document.getElementById("edit-titel")?.value.trim();
    if (!titel) {
      if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Titel ist erforderlich.", true);
      return;
    }

    const projektId = document.getElementById("edit-projekt")?.value;
    if (!projektId) {
      if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Projekt ist erforderlich.", true);
      return;
    }

    const prioritaetChip = document.querySelector("#edit-prioritaet-chips .chip.is-selected");
    const prioritaet = prioritaetChip ? prioritaetChip.dataset.prioritaet : Prioritaet.P3Normal;

    let finalStart = document.getElementById("edit-startdatum")?.value || null;
    let finalFaellig = document.getElementById("edit-faelligkeit")?.value || null;
    if (finalFaellig && !finalStart) finalStart = finalFaellig;
    if (finalStart && !finalFaellig) finalFaellig = finalStart;

    try {
      Store.addOrUpdateAufgabe({
        Id: aufgabeId,
        Titel: titel,
        ProjektId: projektId,
        Prioritaet: prioritaet,
        Status: document.getElementById("edit-status")?.value || AufgabenStatus.Offen,
        Startdatum: finalStart,
        Faelligkeit: finalFaellig,
        SollZeit: parseFloat(sollZeit) || 0,
        Zeitbuchungen: this._zeitbuchungenEntwurf,
        Notizen: document.getElementById("edit-notizen")?.value.trim() || "",
        Links: this._linksEntwurf.map((l) => l.trim()).filter(Boolean),
        Checkliste: this._checklisteEntwurf,
      });

      if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Aufgabe gespeichert.");
      if (schliessenNachSpeichern) {
        App.schliesseDetails();
      }
    } catch (err) {
      if (typeof Anzeige !== "undefined") Anzeige.zeigeToast(err.message, true);
    }
  },
};
