/**
 * Focus Web – Dashboard.
 * Flache Aufgabenliste mit Bereichs-, Projekt- und Dropdown-Filterung.
 */

const Dashboard = {
  ausgewaehlterBereich: "Alle",
  ausgewaehltesProjekt: "Alle",
  ausgewaehlterAnsichtsFilter: "Alle",

  init() {
    document.addEventListener("focus:datenGeaendert", () => this.render());

    const ansichtSelect = document.getElementById("dashboard-ansicht-filter");
    if (ansichtSelect) {
      ansichtSelect.addEventListener("change", (e) => this.setAnsichtsFilter(e.target.value));
    }

    this.render();
  },

  setAnsichtsFilter(filter) {
    this.ausgewaehlterAnsichtsFilter = filter;
    this.render();
  },

  setBereichFilter(bereich) {
    this.ausgewaehlterBereich = bereich;
    this.ausgewaehltesProjekt = "Alle";
    this.render();
  },

  setProjektFilter(projekt) {
    this.ausgewaehltesProjekt = projekt;
    this.render();
  },

  _gefiltert(aufgaben) {
    let query = aufgaben;

    // 1. Bereich- & Projekt-Filter
    if (this.ausgewaehlterBereich !== "Alle") {
      query = query.filter((a) => (a.Bereich || "").toLowerCase() === this.ausgewaehlterBereich.toLowerCase());

      if (this.ausgewaehltesProjekt !== "Alle") {
        query = query.filter((a) => (a.ProjektName || "").toLowerCase() === this.ausgewaehltesProjekt.toLowerCase());
      }
    }

    // 2. Ansichts-Filter aus dem Dropdown-Menü
    const heute = heuteIso();
    const wochenEnde = wochenEndeIso(heute);

    switch (this.ausgewaehlterAnsichtsFilter) {
      case "P1":
        query = query.filter((a) => a.Prioritaet === Prioritaet.P1Dringend);
        break;
      case "P2":
        query = query.filter((a) => a.Prioritaet === Prioritaet.P2Wichtig);
        break;
      case "P3":
        query = query.filter((a) => a.Prioritaet === Prioritaet.P3Normal);
        break;
      case "Ueberfaellig":
        query = query.filter((a) => a.Faelligkeit && a.Faelligkeit < heute);
        break;
      case "Heute":
        query = query.filter((a) => a.Faelligkeit === heute);
        break;
      case "DieseWoche":
        query = query.filter((a) => a.Faelligkeit && a.Faelligkeit >= heute && a.Faelligkeit <= wochenEnde);
        break;
      case "Alle":
      default:
        break;
    }

    return query;
  },

  _sortiereNachPrioUndFaelligkeit(liste) {
    return [...liste].sort((a, b) => {
      const prioA = PRIORITAET_REIHENFOLGE.indexOf(a.Prioritaet);
      const prioB = PRIORITAET_REIHENFOLGE.indexOf(b.Prioritaet);
      if (prioA !== prioB) return prioA - prioB;

      const faelA = a.Faelligkeit || "9999-12-31";
      const faelB = b.Faelligkeit || "9999-12-31";
      return faelA.localeCompare(faelB);
    });
  },

  render() {
    const aufgaben = Store.getAufgaben();
    const bereiche = Store.getBereiche();

    this._renderBereichFilter(bereiche);
    this._renderProjektFilter(aufgaben, bereiche);

    const offen = aufgaben.filter((a) => a.Status === AufgabenStatus.Offen || a.Status === AufgabenStatus.InArbeit);

    // KPI-Übersichtskarten berechnen
    const heute = heuteIso();
    const wochenEnde = wochenEndeIso(heute);
    const kpis = {
      offeneGesamt: offen.length,
      offenP1: offen.filter((a) => a.Prioritaet === Prioritaet.P1Dringend).length,
      offenP2: offen.filter((a) => a.Prioritaet === Prioritaet.P2Wichtig).length,
      heuteFaellig: offen.filter((a) => a.Faelligkeit === heute).length,
      dieseWocheFaellig: offen.filter((a) => a.Faelligkeit && a.Faelligkeit >= heute && a.Faelligkeit <= wochenEnde).length,
      ueberfaellig: offen.filter((a) => a.Faelligkeit && a.Faelligkeit < heute).length,
    };
    this._renderKpis(kpis);

    // Filter anwenden & Liste anzeigen
    const gefiltert = this._gefiltert(offen);
    const sortiert = this._sortiereNachPrioUndFaelligkeit(gefiltert);
    this._renderAufgabenListe(sortiert);
  },

  _renderBereichFilter(bereiche) {
    const container = document.getElementById("dashboard-bereich-filter");
    const optionen = ["Alle", ...bereiche];

    if (!optionen.includes(this.ausgewaehlterBereich)) {
      this.ausgewaehlterBereich = "Alle";
    }

    container.innerHTML = "";
    for (const option of optionen) {
      const btn = document.createElement("button");
      btn.className = "chip" + (option === this.ausgewaehlterBereich ? " is-selected" : "");
      btn.textContent = option;
      btn.addEventListener("click", () => this.setBereichFilter(option));
      container.appendChild(btn);
    }
  },

  _renderProjektFilter(aufgaben, _bereiche) {
    const group = document.getElementById("dashboard-projekt-filter-group");
    const container = document.getElementById("dashboard-projekt-filter");

    if (this.ausgewaehlterBereich === "Alle") {
      group.hidden = true;
      return;
    }

    const projektNamen = Store.getProjekte(this.ausgewaehlterBereich).map((p) => p.Name);
    const optionen = ["Alle", ...projektNamen];

    if (!optionen.includes(this.ausgewaehltesProjekt)) {
      this.ausgewaehltesProjekt = "Alle";
    }

    group.hidden = optionen.length <= 1;

    container.innerHTML = "";
    for (const option of optionen) {
      const btn = document.createElement("button");
      btn.className = "chip" + (option === this.ausgewaehltesProjekt ? " is-selected" : "");
      btn.textContent = option;
      btn.addEventListener("click", () => this.setProjektFilter(option));
      container.appendChild(btn);
    }
  },

  _renderKpis(kpis) {
    const container = document.getElementById("dashboard-kpis");
    const karten = [
      { label: "Offen gesamt", value: kpis.offeneGesamt, cls: "" },
      { label: "P1 Dringend", value: kpis.offenP1, cls: "kpi-card--p1" },
      { label: "P2 Wichtig", value: kpis.offenP2, cls: "kpi-card--p2" },
      { label: "Heute fällig", value: kpis.heuteFaellig, cls: "" },
      { label: "Diese Woche", value: kpis.dieseWocheFaellig, cls: "" },
      { label: "Überfällig", value: kpis.ueberfaellig, cls: kpis.ueberfaellig > 0 ? "kpi-card--warn" : "" },
    ];

    container.innerHTML = karten
      .map(
        (k) => `
      <div class="kpi-card ${k.cls}">
        <div class="kpi-card__value">${k.value}</div>
        <div class="kpi-card__label">${k.label}</div>
      </div>`
      )
      .join("");
  },

  _renderAufgabenListe(items) {
    const container = document.getElementById("dashboard-sektionen");
    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "sektion";

    if (items.length === 0) {
      wrapper.innerHTML = `<div class="sektion__empty">Keine Aufgaben für diese Filterauswahl vorhanden.</div>`;
    } else {
      for (const aufgabe of items) {
        wrapper.appendChild(this._renderAufgabeRow(aufgabe));
      }
    }

    container.appendChild(wrapper);
  },

  _renderAufgabeRow(aufgabe) {
    const row = document.createElement("div");
    row.className = "aufgabe-row";
    row.addEventListener("click", () => App.oeffneDetails(aufgabe.Id));

    const bereichFarbe = LokaleEinstellungen.getBereichFarbe(aufgabe.Bereich);
    if (bereichFarbe) row.style.borderLeftColor = bereichFarbe;

    const heute = heuteIso();
    const istUeberfaellig = aufgabe.Faelligkeit && aufgabe.Faelligkeit < heute && aufgabe.Status !== AufgabenStatus.Erledigt;

    row.innerHTML = `
      <span class="status-dot ${Anzeige.statusDotClass(aufgabe.Status)}">${Anzeige.statusSymbol(aufgabe.Status)}</span>
      <span class="badge ${Anzeige.prioritaetBadgeClass(aufgabe.Prioritaet)}">${Anzeige.prioritaetText(aufgabe.Prioritaet)}</span>
      <div class="aufgabe-row__main">
        <div class="aufgabe-row__titel ${aufgabe.Status === AufgabenStatus.Erledigt ? "is-erledigt" : ""}">${escapeHtml(aufgabe.Titel)}</div>
        <div class="aufgabe-row__meta">${bereichFarbe ? `<span class="bereich-farbe-dot" style="background:${bereichFarbe}"></span>` : ""}${escapeHtml(aufgabe.Bereich || "")}${aufgabe.ProjektName ? " · " + escapeHtml(aufgabe.ProjektName) : ""}</div>
      </div>
      ${aufgabe.Faelligkeit ? `<span class="faellig-tag ${istUeberfaellig ? "is-ueberfaellig" : ""}">${Anzeige.faelligkeitText(aufgabe.Faelligkeit)}</span>` : ""}
    `;

    return row;
  },
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}
