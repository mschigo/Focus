/**
 * Focus Web – Dashboard.
 * Entspricht ViewModels/DashboardViewModel.cs: KPIs, nach Priorität/Fälligkeit
 * gruppierte Top-Listen, Bereichs-/Projektfilter, ein-/ausklappbare Sektionen.
 */

const ALLE_SEKTION_KEYS = ["Ueberfaellig", "P1", "P2", "P3", "Heute", "DieseWoche", "Erledigt"];

const Dashboard = {
  ausgewaehlterBereich: "Alle",
  ausgewaehltesProjekt: "Alle",
  eingeklappt: new Set(["Erledigt"]), // Erledigt ist standardmäßig eingeklappt, wie in der App.

  init() {
    document.addEventListener("focus:datenGeaendert", () => this.render());
    document.getElementById("dashboard-toggle-alle-btn").addEventListener("click", () => this.toggleAlleSektionen());
    this.render();
  },

  /** Klappt alle Sektionen auf, wenn mindestens eine eingeklappt ist – sonst alle zu. */
  toggleAlleSektionen() {
    const alleOffen = this.eingeklappt.size === 0;

    if (alleOffen) {
      for (const key of ALLE_SEKTION_KEYS) this.eingeklappt.add(key);
    } else {
      this.eingeklappt.clear();
    }

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

  toggleSektion(key) {
    if (this.eingeklappt.has(key)) {
      this.eingeklappt.delete(key);
    } else {
      this.eingeklappt.add(key);
    }
    this.render();
  },

  _gefiltert(aufgaben) {
    let query = aufgaben;

    if (this.ausgewaehlterBereich !== "Alle") {
      query = query.filter((a) => (a.Bereich || "").toLowerCase() === this.ausgewaehlterBereich.toLowerCase());

      if (this.ausgewaehltesProjekt !== "Alle") {
        query = query.filter((a) => (a.ProjektName || "").toLowerCase() === this.ausgewaehltesProjekt.toLowerCase());
      }
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
    const gefiltert = this._gefiltert(offen);

    const heute = heuteIso();
    const wochenEnde = wochenEndeIso(heute);

    const kpis = {
      offeneGesamt: gefiltert.length,
      offenP1: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P1Dringend).length,
      offenP2: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P2Wichtig).length,
      heuteFaellig: gefiltert.filter((a) => a.Faelligkeit === heute).length,
      dieseWocheFaellig: gefiltert.filter((a) => a.Faelligkeit && a.Faelligkeit >= heute && a.Faelligkeit <= wochenEnde).length,
      ueberfaellig: gefiltert.filter((a) => a.Faelligkeit && a.Faelligkeit < heute).length,
    };

    this._renderKpis(kpis);

    const erledigt = this._gefiltert(aufgaben.filter((a) => a.Status === AufgabenStatus.Erledigt))
      .sort((a, b) => (b.GeaendertAm || "").localeCompare(a.GeaendertAm || ""))
      .slice(0, 30);

    const sektionen = [
      { key: "Ueberfaellig", titel: "Überfällig", items: gefiltert.filter((a) => a.Faelligkeit && a.Faelligkeit < heute) },
      { key: "P1", titel: "Top P1", items: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P1Dringend) },
      { key: "P2", titel: "Top P2", items: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P2Wichtig) },
      { key: "P3", titel: "Top P3", items: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P3Normal) },
      { key: "Heute", titel: "Heute", items: gefiltert.filter((a) => a.Faelligkeit === heute) },
      { key: "DieseWoche", titel: "Diese Woche", items: gefiltert.filter((a) => a.Faelligkeit && a.Faelligkeit >= heute && a.Faelligkeit <= wochenEnde) },
      { key: "Erledigt", titel: "Erledigt", items: erledigt, keineBegrenzung: true },
    ];

    for (const sektion of sektionen) {
      if (!sektion.keineBegrenzung) {
        sektion.items = this._sortiereNachPrioUndFaelligkeit(sektion.items).slice(0, 10);
      }
    }

    this._renderSektionen(sektionen);
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

  _renderSektionen(sektionen) {
    const container = document.getElementById("dashboard-sektionen");
    container.innerHTML = "";

    document.getElementById("dashboard-toggle-alle-btn").textContent =
      this.eingeklappt.size === 0 ? "Alle einklappen" : "Alle aufklappen";

    for (const sektion of sektionen) {
      const istEingeklappt = this.eingeklappt.has(sektion.key);

      const wrapper = document.createElement("div");
      wrapper.className = "sektion";

      const header = document.createElement("div");
      header.className = "sektion__header";
      header.innerHTML = `<span class="chevron">${istEingeklappt ? "▶" : "▼"}</span> ${sektion.titel} (${sektion.items.length})`;
      header.addEventListener("click", () => this.toggleSektion(sektion.key));
      wrapper.appendChild(header);

      const body = document.createElement("div");
      body.className = "sektion__body" + (istEingeklappt ? " is-collapsed" : "");

      if (sektion.items.length === 0) {
        body.innerHTML = `<div class="sektion__empty">Keine Aufgaben.</div>`;
      } else {
        for (const aufgabe of sektion.items) {
          body.appendChild(this._renderAufgabeRow(aufgabe));
        }
      }

      wrapper.appendChild(body);
      container.appendChild(wrapper);
    }
  },

  _renderAufgabeRow(aufgabe) {
    const row = document.createElement("div");
    row.className = "aufgabe-row";
    row.addEventListener("click", () => App.oeffneDetails(aufgabe.Id));

    const bereichFarbe = LokaleEinstellungen.getBereichFarbe(aufgabe.Bereich);
    if (bereichFarbe) {
      row.style.backgroundColor = bereichFarbe;
      row.style.borderLeftColor = bereichFarbe;
    }

    const heute = heuteIso();
    const istUeberfaellig = aufgabe.Faelligkeit && aufgabe.Faelligkeit < heute && aufgabe.IstAktiv;

    row.innerHTML = `
      <span class="status-dot ${Anzeige.statusDotClass(aufgabe.Status)}">${Anzeige.statusSymbol(aufgabe.Status)}</span>
      <span class="badge ${Anzeige.prioritaetBadgeClass(aufgabe.Prioritaet)}">${Anzeige.prioritaetText(aufgabe.Prioritaet)}</span>
      <div class="aufgabe-row__main">
        <div class="aufgabe-row__titel ${aufgabe.Status === AufgabenStatus.Erledigt ? "is-erledigt" : ""}">${escapeHtml(aufgabe.Titel)}</div>
        <div class="aufgabe-row__meta">${escapeHtml(aufgabe.Bereich || "")}${aufgabe.ProjektName ? " · " + escapeHtml(aufgabe.ProjektName) : ""}</div>
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
