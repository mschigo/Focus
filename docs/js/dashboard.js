/**
 * Focus Web – Dashboard.
 * Dashboard mit Dropdown-Filtern und frei wählbarer Sortierung.
 */

const ALLE_SEKTION_KEYS = ["Ueberfaellig", "P1", "P2", "P3", "Heute", "DieseWoche", "Erledigt"];
const DASHBOARD_SORTIERUNGEN = [
  { wert: "prioritaet", text: "Priorität und Fälligkeit" },
  { wert: "faelligkeit", text: "Fälligkeit" },
  { wert: "geaendert", text: "Zuletzt geändert" },
  { wert: "titel", text: "Titel (A–Z)" },
];

const Dashboard = {
  ausgewaehlterBereich: "Alle",
  ausgewaehltesProjekt: "Alle",
  sortierung: "prioritaet",
  eingeklappt: new Set(["Erledigt"]),

  init() {
    document.addEventListener("focus:datenGeaendert", () => this.render());
    document.getElementById("dashboard-toggle-alle-btn").addEventListener("click", () => this.toggleAlleSektionen());
    document.getElementById("dashboard-sortierung").addEventListener("change", (event) => this.setSortierung(event.target.value));
    document.getElementById("dashboard-bereich-filter").addEventListener("change", (event) => this.setBereichFilter(event.target.value));
    document.getElementById("dashboard-projekt-filter").addEventListener("change", (event) => this.setProjektFilter(event.target.value));
    this.render();
  },

  toggleAlleSektionen() {
    const alleOffen = this.eingeklappt.size === 0;
    if (alleOffen) for (const key of ALLE_SEKTION_KEYS) this.eingeklappt.add(key);
    else this.eingeklappt.clear();
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

  setSortierung(sortierung) {
    this.sortierung = sortierung;
    this.render();
  },

  toggleSektion(key) {
    if (this.eingeklappt.has(key)) this.eingeklappt.delete(key);
    else this.eingeklappt.add(key);
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

  _sortiere(liste) {
    return [...liste].sort((a, b) => {
      if (this.sortierung === "titel") return (a.Titel || "").localeCompare(b.Titel || "", "de", { sensitivity: "base" });
      if (this.sortierung === "geaendert") return (b.GeaendertAm || "").localeCompare(a.GeaendertAm || "");
      if (this.sortierung === "faelligkeit") {
        const faelA = a.Faelligkeit || "9999-12-31";
        const faelB = b.Faelligkeit || "9999-12-31";
        return faelA.localeCompare(faelB) || PRIORITAET_REIHENFOLGE.indexOf(a.Prioritaet) - PRIORITAET_REIHENFOLGE.indexOf(b.Prioritaet);
      }
      const prio = PRIORITAET_REIHENFOLGE.indexOf(a.Prioritaet) - PRIORITAET_REIHENFOLGE.indexOf(b.Prioritaet);
      if (prio !== 0) return prio;
      return (a.Faelligkeit || "9999-12-31").localeCompare(b.Faelligkeit || "9999-12-31");
    });
  },

  render() {
    const aufgaben = Store.getAufgaben();
    const bereiche = Store.getBereiche();
    this._renderSortierung();
    this._renderBereichFilter(bereiche);
    this._renderProjektFilter();

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

    const erledigt = this._gefiltert(aufgaben.filter((a) => a.Status === AufgabenStatus.Erledigt));
    const sektionen = [
      { key: "Ueberfaellig", titel: "Überfällig", items: gefiltert.filter((a) => a.Faelligkeit && a.Faelligkeit < heute) },
      { key: "P1", titel: "Top P1", items: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P1Dringend) },
      { key: "P2", titel: "Top P2", items: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P2Wichtig) },
      { key: "P3", titel: "Top P3", items: gefiltert.filter((a) => a.Prioritaet === Prioritaet.P3Normal) },
      { key: "Heute", titel: "Heute", items: gefiltert.filter((a) => a.Faelligkeit === heute) },
      { key: "DieseWoche", titel: "Diese Woche", items: gefiltert.filter((a) => a.Faelligkeit && a.Faelligkeit >= heute && a.Faelligkeit <= wochenEnde) },
      { key: "Erledigt", titel: "Erledigt", items: erledigt, keineBegrenzung: true },
    ];
    for (const sektion of sektionen) sektion.items = this._sortiere(sektion.items).slice(0, sektion.keineBegrenzung ? 30 : 10);
    this._renderSektionen(sektionen);
  },

  _renderSortierung() {
    const select = document.getElementById("dashboard-sortierung");
    select.innerHTML = DASHBOARD_SORTIERUNGEN.map((o) => `<option value="${o.wert}">${o.text}</option>`).join("");
    select.value = this.sortierung;
  },

  _renderBereichFilter(bereiche) {
    const select = document.getElementById("dashboard-bereich-filter");
    const optionen = ["Alle", ...bereiche];
    if (!optionen.includes(this.ausgewaehlterBereich)) this.ausgewaehlterBereich = "Alle";
    select.innerHTML = optionen.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("");
    select.value = this.ausgewaehlterBereich;
  },

  _renderProjektFilter() {
    const group = document.getElementById("dashboard-projekt-filter-group");
    const select = document.getElementById("dashboard-projekt-filter");
    if (this.ausgewaehlterBereich === "Alle") { group.hidden = true; return; }
    const optionen = ["Alle", ...Store.getProjekte(this.ausgewaehlterBereich).map((p) => p.Name)];
    if (!optionen.includes(this.ausgewaehltesProjekt)) this.ausgewaehltesProjekt = "Alle";
    group.hidden = optionen.length <= 1;
    select.innerHTML = optionen.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("");
    select.value = this.ausgewaehltesProjekt;
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
    container.innerHTML = karten.map((k) => `<div class="kpi-card ${k.cls}"><div class="kpi-card__value">${k.value}</div><div class="kpi-card__label">${k.label}</div></div>`).join("");
  },

  _renderSektionen(sektionen) {
    const container = document.getElementById("dashboard-sektionen");
    container.innerHTML = "";
    document.getElementById("dashboard-toggle-alle-btn").textContent = this.eingeklappt.size === 0 ? "Alle einklappen" : "Alle aufklappen";
    for (const sektion of sektionen) {
      const istEingeklappt = this.eingeklappt.has(sektion.key);
      const wrapper = document.createElement("div"); wrapper.className = "sektion";
      const header = document.createElement("div"); header.className = "sektion__header";
      header.innerHTML = `<span class="chevron">${istEingeklappt ? "▶" : "▼"}</span> ${sektion.titel} (${sektion.items.length})`;
      header.addEventListener("click", () => this.toggleSektion(sektion.key)); wrapper.appendChild(header);
      const body = document.createElement("div"); body.className = "sektion__body" + (istEingeklappt ? " is-collapsed" : "");
      if (!sektion.items.length) body.innerHTML = `<div class="sektion__empty">Keine Aufgaben.</div>`;
      else for (const aufgabe of sektion.items) body.appendChild(this._renderAufgabeRow(aufgabe));
      wrapper.appendChild(body); container.appendChild(wrapper);
    }
  },

  _renderAufgabeRow(aufgabe) {
    const row = document.createElement("div"); row.className = "aufgabe-row";
    row.addEventListener("click", () => App.oeffneDetails(aufgabe.Id));
    const bereichFarbe = LokaleEinstellungen.getBereichFarbe(aufgabe.Bereich);
    if (bereichFarbe) row.style.borderLeftColor = bereichFarbe;
    const istUeberfaellig = aufgabe.Faelligkeit && aufgabe.Faelligkeit < heuteIso() && aufgabe.IstAktiv;
    row.innerHTML = `<span class="status-dot ${Anzeige.statusDotClass(aufgabe.Status)}">${Anzeige.statusSymbol(aufgabe.Status)}</span><span class="badge ${Anzeige.prioritaetBadgeClass(aufgabe.Prioritaet)}">${Anzeige.prioritaetText(aufgabe.Prioritaet)}</span><div class="aufgabe-row__main"><div class="aufgabe-row__titel ${aufgabe.Status === AufgabenStatus.Erledigt ? "is-erledigt" : ""}">${escapeHtml(aufgabe.Titel)}</div><div class="aufgabe-row__meta">${bereichFarbe ? `<span class="bereich-farbe-dot" style="background:${bereichFarbe}"></span>` : ""}${escapeHtml(aufgabe.Bereich || "")}${aufgabe.ProjektName ? ` · ${escapeHtml(aufgabe.ProjektName)}` : ""}</div></div>${aufgabe.Faelligkeit ? `<span class="faellig-tag ${istUeberfaellig ? "is-ueberfaellig" : ""}">${Anzeige.faelligkeitText(aufgabe.Faelligkeit)}</span>` : ""}`;
    return row;
  },
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}
