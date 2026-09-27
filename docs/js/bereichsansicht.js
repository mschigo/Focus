/**
 * Focus Web – Bereichsansicht.
 * Entspricht ViewModels/BereichsansichtViewModel.cs: aktive Aufgaben eines
 * (optional gewählten) Bereichs, gruppiert nach Priorität P1/P2/P3.
 */

const Bereichsansicht = {
  ausgewaehlterBereich: "Alle Bereiche",

  init() {
    document.addEventListener("focus:datenGeaendert", () => this.render());
    this.render();
  },

  _setBereich(value) {
    this.ausgewaehlterBereich = value;
    this.render();
  },

  render() {
    if (!Store._daten) return; // Noch nicht eingeloggt/geladen.

    const bereiche = Store.getBereiche();
    this._renderBereichChips(bereiche);

    const aktive = Store.getAufgaben().filter((a) => a.IstAktiv);

    let gefiltert = aktive;
    if (this.ausgewaehlterBereich !== "Alle Bereiche") {
      gefiltert = gefiltert.filter((a) => (a.Bereich || "").toLowerCase() === this.ausgewaehlterBereich.toLowerCase());
    }

    const sortiert = [...gefiltert].sort((a, b) => {
      const prioA = PRIORITAET_REIHENFOLGE.indexOf(a.Prioritaet);
      const prioB = PRIORITAET_REIHENFOLGE.indexOf(b.Prioritaet);
      if (prioA !== prioB) return prioA - prioB;

      const faelA = a.Faelligkeit || "9999-12-31";
      const faelB = b.Faelligkeit || "9999-12-31";
      return faelA.localeCompare(faelB);
    });

    const gruppen = [
      { prio: Prioritaet.P1Dringend, icon: "🔴", titel: "DRINGEND (P1)" },
      { prio: Prioritaet.P2Wichtig, icon: "🟠", titel: "WICHTIG (P2)" },
      { prio: Prioritaet.P3Normal, icon: "⚪", titel: "NORMAL (P3)" },
    ];

    const container = document.getElementById("bereichsansicht-gruppen");
    container.innerHTML = "";

    for (const gruppe of gruppen) {
      const items = sortiert.filter((a) => a.Prioritaet === gruppe.prio);

      const wrapper = document.createElement("div");
      wrapper.className = "sektion";

      const header = document.createElement("div");
      header.className = "sektion__header";
      header.style.cursor = "default";
      header.textContent = `${gruppe.icon} ${gruppe.titel} (${items.length})`;
      wrapper.appendChild(header);

      const body = document.createElement("div");
      body.className = "sektion__body";

      if (items.length === 0) {
        body.innerHTML = `<div class="sektion__empty">Keine Aufgaben.</div>`;
      } else {
        for (const aufgabe of items) {
          body.appendChild(this._renderItem(aufgabe));
        }
      }

      wrapper.appendChild(body);
      container.appendChild(wrapper);
    }
  },

  _renderBereichChips(bereiche) {
    const container = document.getElementById("bereichsansicht-bereich-filter");
    const optionen = ["Alle Bereiche", ...bereiche];

    if (!optionen.includes(this.ausgewaehlterBereich)) {
      this.ausgewaehlterBereich = "Alle Bereiche";
    }

    container.innerHTML = "";
    for (const option of optionen) {
      const btn = document.createElement("button");
      btn.className = "chip" + (option === this.ausgewaehlterBereich ? " is-selected" : "");
      btn.textContent = option;
      btn.addEventListener("click", () => this._setBereich(option));
      container.appendChild(btn);
    }
  },

  _renderItem(aufgabe) {
    const row = document.createElement("div");
    row.className = "aufgabe-row";
    row.addEventListener("click", () => App.oeffneDetails(aufgabe.Id));

    const bereichFarbe = LokaleEinstellungen.getBereichFarbe(aufgabe.Bereich);
    if (bereichFarbe) row.style.borderLeftColor = bereichFarbe;

    const heute = heuteIso();
    const istUeberfaellig = aufgabe.Faelligkeit && aufgabe.Faelligkeit < heute;

    row.innerHTML = `
      <span class="status-dot ${Anzeige.statusDotClass(aufgabe.Status)}">${Anzeige.statusSymbol(aufgabe.Status)}</span>
      <div class="aufgabe-row__main">
        <div class="aufgabe-row__titel">${escapeHtml(aufgabe.Titel)}</div>
        <div class="aufgabe-row__meta">${escapeHtml(aufgabe.Bereich || "")}${aufgabe.ProjektName ? " · " + escapeHtml(aufgabe.ProjektName) : ""}</div>
      </div>
      ${aufgabe.Faelligkeit ? `<span class="faellig-tag ${istUeberfaellig ? "is-ueberfaellig" : ""}">${Anzeige.faelligkeitText(aufgabe.Faelligkeit)}</span>` : ""}
    `;

    return row;
  },
};
