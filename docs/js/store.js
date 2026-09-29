/**
 * Focus Web – Datenmodell & Speicher.
 *
 * Datenformat entspricht der aufgaben.json aus der MAUI-App.
 */

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const Prioritaet = Object.freeze({
  P1Dringend: "P1Dringend",
  P2Wichtig: "P2Wichtig",
  P3Normal: "P3Normal",
  P4Spaeter: "P4Spaeter",
});

const PRIORITAET_REIHENFOLGE = [
  Prioritaet.P1Dringend,
  Prioritaet.P2Wichtig,
  Prioritaet.P3Normal,
  Prioritaet.P4Spaeter,
];

const AufgabenStatus = Object.freeze({
  Offen: "Offen",
  InArbeit: "InArbeit",
  Erledigt: "Erledigt",
});

function neueId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function heuteIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function wochenEndeIso(heute) {
  const d = new Date(`${heute}T00:00:00`);
  const dayOfWeek = d.getDay();
  d.setDate(d.getDate() + (6 - dayOfWeek));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Erkennt, ob ein Link/Pfad auf eine lokale Datei zeigt (statt auf eine Web-URL).
function istDateiPfad(text) {
  if (!text) return false;
  const t = text.trim();
  return t.startsWith("file://") || t.includes(":\\") || t.startsWith("\\\\");
}

// Liest die Links einer Aufgabe: neues Format ist ein Array "Links", ältere
// Aufgaben hatten nur ein einzelnes Feld "Link" (String) – wird transparent migriert.
function linksAusAufgabe(a) {
  if (Array.isArray(a.Links) && a.Links.some((l) => l && l.trim())) {
    return a.Links.map((l) => (l || "").trim()).filter(Boolean);
  }
  if (a.Link && a.Link.trim()) return [a.Link.trim()];
  return [];
}

// Liest die Zeitbuchungen einer Aufgabe: neues Format ist ein Array
// "Zeitbuchungen" ({ Id, Datum, Stunden }), damit an unterschiedlichen Tagen
// (auch über Monatsgrenzen hinweg) erfasste Ist-Zeit in der Auswertung korrekt
// dem jeweiligen Tag zugeordnet werden kann. Ältere Aufgaben hatten nur eine
// einzelne "IstZeit"-Zahl ohne Datum – wird transparent auf einen plausiblen
// Tag (letzte Änderung, sonst Erstellung, sonst heute) migriert.
function zeitbuchungenAusAufgabe(a) {
  if (Array.isArray(a.Zeitbuchungen) && a.Zeitbuchungen.length > 0) {
    return a.Zeitbuchungen
      .filter((z) => z && z.Datum && !isNaN(parseFloat(z.Stunden)) && parseFloat(z.Stunden) > 0)
      .map((z) => ({ Id: z.Id || neueId(), Datum: z.Datum, Stunden: Math.round(parseFloat(z.Stunden) * 100) / 100 }));
  }

  const legacyIst = parseFloat(a.IstZeit) || 0;
  if (legacyIst > 0) {
    const datum = ((a.GeaendertAm || a.ErstelltAm || nowIso()) + "").slice(0, 10);
    return [{ Id: neueId(), Datum: datum, Stunden: legacyIst }];
  }

  return [];
}

function normalisiereDaten(parsed) {
  const bereichFarben = parsed?.Konfiguration?.BereichFarben;
  return {
    Aufgaben: Array.isArray(parsed?.Aufgaben) ? parsed.Aufgaben : [],
    Projekte: Array.isArray(parsed?.Projekte) ? parsed.Projekte : [],
    Konfiguration: {
      Bereiche: Array.isArray(parsed?.Konfiguration?.Bereiche) ? parsed.Konfiguration.Bereiche : [],
      BereichFarben: bereichFarben && typeof bereichFarben === "object" ? bereichFarben : {},
    },
  };
}

const Store = {
  _daten: null,
  _userId: null,
  _authCallbacks: [],

  onAuthChange(callback) {
    this._authCallbacks.push(callback);
  },

  _notifyAuthChange(eingeloggt) {
    for (const cb of this._authCallbacks) {
      try { cb(eingeloggt); } catch (err) { console.error("Focus: Fehler in Auth-Callback.", err); }
    }
  },

  async starteAuthUeberwachung() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) console.error("Focus: Fehler beim Prüfen der Sitzung.", error);

    if (data?.session) {
      await this._ladeFuerNutzer(data.session.user.id);
      this._notifyAuthChange(true);
    } else {
      this._notifyAuthChange(false);
    }

    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        try {
          await this._ladeFuerNutzer(session.user.id);
          this._notifyAuthChange(true);
        } catch (err) {
          console.error("Focus: Fehler beim Laden nach Login.", err);
        }
      } else {
        this._daten = null;
        this._userId = null;
        this._notifyAuthChange(false);
      }
    });
  },

  async anmelden(email, passwort) {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: passwort });
    if (error) throw error;
  },

  async registrieren(email, passwort) {
    const { error } = await supabaseClient.auth.signUp({ email, password: passwort });
    if (error) throw error;
  },

  async abmelden() {
    await supabaseClient.auth.signOut();
  },

  async _ladeFuerNutzer(userId) {
    this._userId = userId;

    const { data, error } = await supabaseClient
      .from("focus_daten")
      .select("daten")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (data && data.daten) {
      this._daten = normalisiereDaten(data.daten);
      this._migriereLokaleBereichFarben();
      return;
    }

    this._daten = { Aufgaben: [], Projekte: [], Konfiguration: { Bereiche: ["Arbeit", "Privat"], BereichFarben: {} } };
    await supabaseClient.from("focus_daten").insert({ user_id: userId, daten: this._daten });
    this._migriereLokaleBereichFarben();
  },

  // Einmalige Migration: Bereichsfarben, die vorher nur lokal (localStorage)
  // gespeichert waren, in die Datenbank übernehmen, falls dort noch keine
  // Farben hinterlegt sind.
  _migriereLokaleBereichFarben() {
    try {
      if (Object.keys(this._daten.Konfiguration.BereichFarben).length > 0) return;
      const lokal = LokaleEinstellungen._laden().bereichFarben || {};
      if (Object.keys(lokal).length === 0) return;

      this._daten.Konfiguration.BereichFarben = { ...lokal };
      this.speichern();
    } catch (err) {
      console.error("Focus: Fehler bei der Migration lokaler Bereichsfarben.", err);
    }
  },

  speichern() {
    document.dispatchEvent(new CustomEvent("focus:datenGeaendert"));
    this._persistiereImHintergrund();
  },

  async _persistiereImHintergrund() {
    if (!this._userId) return;

    const { error } = await supabaseClient
      .from("focus_daten")
      .update({ daten: this._daten, aktualisiert_am: nowIso() })
      .eq("user_id", this._userId);

    if (error && typeof Anzeige !== "undefined") {
      Anzeige.zeigeToast("Speichern fehlgeschlagen: " + error.message, true);
    }
  },

  _pruefeGeladen() {
    if (!this._daten) throw new Error("Daten sind noch nicht geladen.");
  },

  getAufgaben() {
    this._pruefeGeladen();

    const projektLookup = new Map(this._daten.Projekte.map((p) => [p.Id, p]));
    const heute = heuteIso();

    return this._daten.Aufgaben.map((a) => {
      const projekt = projektLookup.get(a.ProjektId);
      const istAktiv = a.Status === AufgabenStatus.Offen || a.Status === AufgabenStatus.InArbeit;
      const istUeberfaellig = !!a.Faelligkeit && a.Faelligkeit < heute && istAktiv;
      const zeitbuchungen = zeitbuchungenAusAufgabe(a);
      const istZeit = zeitbuchungen.reduce((summe, z) => summe + z.Stunden, 0);

      return {
        ...a,
        Bereich: projekt ? projekt.Bereich : "",
        ProjektName: projekt ? projekt.Name : "",
        IstAktiv: istAktiv,
        IstAbgeschwaecht: a.Status === AufgabenStatus.Erledigt,
        IstUeberfaellig: istUeberfaellig,
        Startdatum: a.Startdatum || null,
        Checkliste: a.Checkliste || [],
        Links: linksAusAufgabe(a),
        SollZeit: parseFloat(a.SollZeit) || 0,
        Zeitbuchungen: zeitbuchungen,
        IstZeit: Math.round(istZeit * 100) / 100,
      };
    });
  },

  getBereichFarbe(bereichName) {
    this._pruefeGeladen();
    if (!bereichName || !bereichName.trim()) return "";
    return this._daten.Konfiguration.BereichFarben[bereichName.trim()] || "";
  },

  setBereichFarbe(bereichName, hex) {
    this._pruefeGeladen();
    if (!bereichName || !bereichName.trim()) return;
    const key = bereichName.trim();
    if (!hex) {
      delete this._daten.Konfiguration.BereichFarben[key];
    } else {
      this._daten.Konfiguration.BereichFarben[key] = hex;
    }
    this.speichern();
  },

  getBereiche() {
    this._pruefeGeladen();
    const gesehen = new Set();
    const ergebnis = [];
    for (const b of this._daten.Konfiguration.Bereiche) {
      if (!b || !b.trim()) continue;
      const key = b.trim().toLowerCase();
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      ergebnis.push(b.trim());
    }
    return ergebnis;
  },

  getProjekte(bereich = null) {
    this._pruefeGeladen();
    let liste = this._daten.Projekte;
    if (bereich && bereich.trim()) {
      const b = bereich.trim().toLowerCase();
      liste = liste.filter((p) => (p.Bereich || "").trim().toLowerCase() === b);
    }
    return [...liste].sort((a, b) => a.Name.localeCompare(b.Name, "de"));
  },

  addOrUpdateAufgabe(aufgabe) {
    this._pruefeGeladen();

    if (!aufgabe.ProjektId || !this._daten.Projekte.some((p) => p.Id === aufgabe.ProjektId)) {
      throw new Error("Die Aufgabe muss einem gültigen Projekt zugeordnet sein.");
    }

    const now = nowIso();
    const index = this._daten.Aufgaben.findIndex((a) => a.Id === aufgabe.Id);

    const zeitbuchungen = Array.isArray(aufgabe.Zeitbuchungen)
      ? aufgabe.Zeitbuchungen
          .filter((z) => z && z.Datum && parseFloat(z.Stunden) > 0)
          .map((z) => ({ Id: z.Id || neueId(), Datum: z.Datum, Stunden: Math.round(parseFloat(z.Stunden) * 100) / 100 }))
      : [];
    const istZeitSumme = Math.round(zeitbuchungen.reduce((summe, z) => summe + z.Stunden, 0) * 100) / 100;

    if (index === -1) {
      const neu = {
        Id: aufgabe.Id || neueId(),
        Titel: aufgabe.Titel,
        ProjektId: aufgabe.ProjektId,
        Prioritaet: aufgabe.Prioritaet || Prioritaet.P3Normal,
        Status: aufgabe.Status || AufgabenStatus.Offen,
        Startdatum: aufgabe.Startdatum || null,
        Faelligkeit: aufgabe.Faelligkeit || null,
        Notizen: aufgabe.Notizen || "",
        Links: Array.isArray(aufgabe.Links) ? aufgabe.Links.map((l) => (l || "").trim()).filter(Boolean) : [],
        Checkliste: aufgabe.Checkliste || [],
        SollZeit: parseFloat(aufgabe.SollZeit) || 0,
        Zeitbuchungen: zeitbuchungen,
        IstZeit: istZeitSumme,
        ErstelltAm: now,
        GeaendertAm: now,
      };
      this._daten.Aufgaben.push(neu);
    } else {
      const bestehend = this._daten.Aufgaben[index];
      this._daten.Aufgaben[index] = {
        ...bestehend,
        Titel: aufgabe.Titel,
        ProjektId: aufgabe.ProjektId,
        Prioritaet: aufgabe.Prioritaet,
        Status: aufgabe.Status,
        Startdatum: aufgabe.Startdatum || null,
        Faelligkeit: aufgabe.Faelligkeit || null,
        Notizen: aufgabe.Notizen || "",
        Links: Array.isArray(aufgabe.Links) ? aufgabe.Links.map((l) => (l || "").trim()).filter(Boolean) : [],
        Checkliste: aufgabe.Checkliste || [],
        SollZeit: parseFloat(aufgabe.SollZeit) || 0,
        Zeitbuchungen: zeitbuchungen,
        IstZeit: istZeitSumme,
        GeaendertAm: now,
      };
    }

    this.speichern();
  },

  setAufgabenStatus(id, status) {
    this._pruefeGeladen();
    const aufgabe = this._daten.Aufgaben.find((a) => a.Id === id);
    if (!aufgabe) return;

    aufgabe.Status = status;
    aufgabe.GeaendertAm = nowIso();
    this.speichern();
  },

  setAufgabeStatus(id, status) {
    this.setAufgabenStatus(id, status);
  },

  endgueltigLoeschen(id) {
    this._pruefeGeladen();
    this._daten.Aufgaben = this._daten.Aufgaben.filter((a) => a.Id !== id);
    this.speichern();
  },

  loescheErledigteAufgaben() {
    this._pruefeGeladen();
    const anzahlVorher = this._daten.Aufgaben.length;
    this._daten.Aufgaben = this._daten.Aufgaben.filter((a) => a.Status !== AufgabenStatus.Erledigt);
    const anzahlGeloescht = anzahlVorher - this._daten.Aufgaben.length;

    if (anzahlGeloescht > 0) this.speichern();
    return anzahlGeloescht;
  },

  addBereich(name) {
    this._pruefeGeladen();
    if (!name || !name.trim()) return;
    const n = name.trim();
    if (this._daten.Konfiguration.Bereiche.some((b) => (b || "").trim().toLowerCase() === n.toLowerCase())) return;
    this._daten.Konfiguration.Bereiche.push(n);

    // Automatisch ein Projekt "Allgemein" anlegen, falls im neuen Bereich
    // noch kein Projekt existiert.
    const hatBereitsProjekt = this._daten.Projekte.some(
      (p) => (p.Bereich || "").trim().toLowerCase() === n.toLowerCase()
    );
    if (!hatBereitsProjekt) {
      this._daten.Projekte.push({ Id: neueId(), Name: "Allgemein", Bereich: n });
    }

    this.speichern();
  },

  addProjekt(bereich, name) {
    this._pruefeGeladen();
    if (!bereich || !bereich.trim()) throw new Error("Bereich ist erforderlich.");
    if (!name || !name.trim()) throw new Error("Projektname ist erforderlich.");

    const b = bereich.trim();
    const n = name.trim();

    if (!this._daten.Konfiguration.Bereiche.some((x) => (x || "").trim().toLowerCase() === b.toLowerCase())) {
      this._daten.Konfiguration.Bereiche.push(b);
    }

    const projekt = { Id: neueId(), Name: n, Bereich: b };
    this._daten.Projekte.push(projekt);
    this.speichern();
    return projekt;
  },

  renameBereich(altName, neuName) {
    this._pruefeGeladen();
    if (!altName || !altName.trim() || !neuName || !neuName.trim()) return;

    const alt = altName.trim();
    const neu = neuName.trim();

    const index = this._daten.Konfiguration.Bereiche.findIndex((b) => (b || "").trim().toLowerCase() === alt.toLowerCase());
    if (index === -1) return;

    const konflikt = this._daten.Konfiguration.Bereiche.findIndex(
      (b, i) => i !== index && (b || "").trim().toLowerCase() === neu.toLowerCase()
    );
    if (konflikt !== -1) {
      throw new Error(`Ein Bereich mit dem Namen "${neu}" existiert bereits.`);
    }

    this._daten.Konfiguration.Bereiche[index] = neu;

    for (const projekt of this._daten.Projekte) {
      if (projekt.Bereich.toLowerCase() === alt.toLowerCase()) {
        projekt.Bereich = neu;
      }
    }

    if (Object.prototype.hasOwnProperty.call(this._daten.Konfiguration.BereichFarben, alt)) {
      this._daten.Konfiguration.BereichFarben[neu] = this._daten.Konfiguration.BereichFarben[alt];
      delete this._daten.Konfiguration.BereichFarben[alt];
    }

    this.speichern();
  },

  // `kaskade = true`: löscht auch alle Projekte des Bereichs (und deren
  // Aufgaben) mit. Ohne `kaskade` wird wie bisher ein Fehler geworfen,
  // solange der Bereich noch Projekte enthält.
  deleteBereich(name, kaskade = false) {
    this._pruefeGeladen();
    if (!name || !name.trim()) return;

    const n = name.trim();
    const projekteImBereich = this._daten.Projekte.filter(
      (p) => (p.Bereich || "").trim().toLowerCase() === n.toLowerCase()
    );

    if (projekteImBereich.length > 0 && !kaskade) {
      throw new Error(`Der Bereich "${n}" hat noch Projekte und kann nicht gelöscht werden.`);
    }

    if (projekteImBereich.length > 0) {
      const projektIds = new Set(projekteImBereich.map((p) => p.Id));
      this._daten.Aufgaben = this._daten.Aufgaben.filter((a) => !projektIds.has(a.ProjektId));
      this._daten.Projekte = this._daten.Projekte.filter((p) => !projektIds.has(p.Id));
    }

    this._daten.Konfiguration.Bereiche = this._daten.Konfiguration.Bereiche.filter(
      (b) => (b || "").trim().toLowerCase() !== n.toLowerCase()
    );
    delete this._daten.Konfiguration.BereichFarben[n];
    this.speichern();
  },

  renameProjekt(projektId, neuerName) {
    this._pruefeGeladen();
    if (!neuerName || !neuerName.trim()) return;

    const projekt = this._daten.Projekte.find((p) => p.Id === projektId);
    if (!projekt) return;

    const neu = neuerName.trim();

    const konflikt = this._daten.Projekte.some(
      (p) => p.Id !== projektId && p.Bereich.toLowerCase() === projekt.Bereich.toLowerCase() && p.Name.toLowerCase() === neu.toLowerCase()
    );
    if (konflikt) {
      throw new Error(`Im Bereich "${projekt.Bereich}" existiert bereits ein Projekt mit diesem Namen.`);
    }

    projekt.Name = neu;
    this.speichern();
  },

  deleteProjekt(projektId) {
    this._pruefeGeladen();

    const projekt = this._daten.Projekte.find((p) => p.Id === projektId);
    if (!projekt) return;

    this._daten.Aufgaben = this._daten.Aufgaben.filter((a) => a.ProjektId !== projektId);
    this._daten.Projekte = this._daten.Projekte.filter((p) => p.Id !== projektId);
    this.speichern();
  },

  exportJson() {
    this._pruefeGeladen();
    return JSON.stringify(this._daten, null, 2);
  },

  importJson(jsonText) {
    this._pruefeGeladen();
    this._daten = normalisiereDaten(JSON.parse(jsonText));
    this.speichern();
  },
};

const Anzeige = {
  prioritaetBadgeClass(prioritaet) {
    switch (prioritaet) {
      case Prioritaet.P1Dringend: return "badge--p1";
      case Prioritaet.P2Wichtig: return "badge--p2";
      case Prioritaet.P4Spaeter: return "badge--p4";
      default: return "badge--p3";
    }
  },

  prioritaetText(prioritaet) {
    switch (prioritaet) {
      case Prioritaet.P1Dringend: return "P1";
      case Prioritaet.P2Wichtig: return "P2";
      case Prioritaet.P4Spaeter: return "P4";
      default: return "P3";
    }
  },

  statusSymbol(status) {
    switch (status) {
      case AufgabenStatus.InArbeit: return "⏱";
      case AufgabenStatus.Erledigt: return "✓";
      default: return "○";
    }
  },

  statusDotClass(status) {
    switch (status) {
      case AufgabenStatus.InArbeit: return "status-dot--inarbeit";
      case AufgabenStatus.Erledigt: return "status-dot--erledigt";
      default: return "status-dot--offen";
    }
  },

  faelligkeitText(isoDatum) {
    if (!isoDatum) return "";
    const [jahr, monat, tag] = isoDatum.split("-");
    return `${tag}.${monat}.${jahr}`;
  },

  zeigeToast(nachricht, istFehler = false) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = nachricht;
    el.classList.toggle("is-error", istFehler);
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
  },
};

/**
 * Dynamische Link-/Pfad-Felder (Neue Aufgabe & Bearbeiten-Popup).
 * Sobald das letzte Feld befüllt wird, erscheint automatisch ein weiteres
 * leeres Feld. Jedes befüllte Feld bekommt einen Öffnen-Button, der Web-Links
 * bzw. Dateipfade erkennt und anklickbar macht.
 */
const Linkfelder = {
  render(container, werte, onChange) {
    if (!container) return;

    // Immer ein leeres Feld am Ende bereithalten – auch wenn bereits
    // bestehende (gefüllte) Links vorhanden sind, z. B. beim Öffnen einer
    // vorhandenen Aufgabe.
    if (werte.length === 0 || (werte[werte.length - 1] || "").trim()) {
      werte.push("");
    }

    container.innerHTML = "";
    werte.forEach((_wert, index) => this._renderZeile(container, werte, index, onChange));
  },

  _renderZeile(container, werte, index, onChange) {
    const row = document.createElement("div");
    row.className = "link-feld-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-input";
    input.placeholder = "https://… oder file:///…";
    input.value = werte[index] || "";

    const oeffnenBtn = document.createElement("a");
    oeffnenBtn.className = "icon-btn link-feld-oeffnen";
    oeffnenBtn.target = "_blank";
    oeffnenBtn.rel = "noopener";
    oeffnenBtn.title = "Öffnen";
    oeffnenBtn.addEventListener("click", (e) => {
      if (!oeffnenBtn.getAttribute("href")) e.preventDefault();
    });

    const entfernenBtn = document.createElement("button");
    entfernenBtn.type = "button";
    entfernenBtn.className = "icon-btn";
    entfernenBtn.title = "Entfernen";
    entfernenBtn.textContent = "✕";

    const aktualisiereOeffnenBtn = () => {
      const wert = (input.value || "").trim();
      if (wert) {
        oeffnenBtn.setAttribute("href", wert);
        oeffnenBtn.textContent = istDateiPfad(wert) ? "📁" : "🔗";
      } else {
        oeffnenBtn.removeAttribute("href");
        oeffnenBtn.textContent = "";
      }
    };
    aktualisiereOeffnenBtn();

    input.addEventListener("input", () => {
      werte[index] = input.value;
      aktualisiereOeffnenBtn();

      // Letztes Feld gerade befüllt? -> neues leeres Feld anhängen (ohne Fokus zu verlieren).
      if (index === werte.length - 1 && input.value.trim()) {
        werte.push("");
        this._renderZeile(container, werte, werte.length - 1, onChange);
      }

      onChange(werte);
    });

    entfernenBtn.addEventListener("click", () => {
      werte.splice(index, 1);
      if (werte.length === 0) werte.push("");
      this.render(container, werte, onChange);
      onChange(werte);
    });

    row.appendChild(input);
    row.appendChild(oeffnenBtn);
    row.appendChild(entfernenBtn);
    container.appendChild(row);
  },
};

/**
 * Zeiterfassung (Ist-Zeit) mit Datum je Buchung (Neue Aufgabe & Bearbeiten-Popup).
 * Jede Buchung ({ Id, Datum, Stunden }) wird einzeln mit ihrem eigenen Datum
 * gespeichert, damit die Auswertung Ist-Zeit korrekt dem jeweiligen Tag
 * zuordnen kann – auch wenn an unterschiedlichen Tagen (über Monatsgrenzen
 * hinweg) für dieselbe Aufgabe Zeit gebucht wird.
 */
const Zeiterfassung = {
  render(container, buchungen, onChange) {
    if (!container) return;

    const gesamt = buchungen.reduce((summe, b) => summe + (parseFloat(b.Stunden) || 0), 0);
    const sortiert = [...buchungen].sort((a, b) => (b.Datum || "").localeCompare(a.Datum || ""));

    const listeHtml = sortiert.length === 0
      ? `<p style="color: var(--color-text-muted); font-size: 13px; margin: 4px 0;">Noch keine Zeit erfasst.</p>`
      : sortiert
          .map(
            (b) => `
        <div class="zeitbuchung-item" data-id="${b.Id}">
          <span class="zeitbuchung-datum">${Anzeige.faelligkeitText(b.Datum)}</span>
          <span class="zeitbuchung-stunden">${b.Stunden} h</span>
          <button type="button" class="icon-btn zeitbuchung-entfernen" data-id="${b.Id}" title="Entfernen">✕</button>
        </div>`
          )
          .join("");

    container.innerHTML = `
      <div class="zeitbuchung-gesamt">Gesamt erfasst: <strong>${Math.round(gesamt * 100) / 100} h</strong></div>
      <div class="zeitbuchung-liste">${listeHtml}</div>
      <div class="zeitbuchung-add-row">
        <input type="date" class="form-input zeitbuchung-add-datum" lang="de-CH" />
        <input type="number" step="0.25" min="0.25" class="form-input zeitbuchung-add-stunden" placeholder="Std." />
        <button type="button" class="btn-secondary zeitbuchung-add-btn">+</button>
      </div>
    `;

    const datumInput = container.querySelector(".zeitbuchung-add-datum");
    const stundenInput = container.querySelector(".zeitbuchung-add-stunden");
    if (datumInput) datumInput.value = heuteIso();

    container.querySelectorAll(".zeitbuchung-entfernen").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const idx = buchungen.findIndex((b) => b.Id === id);
        if (idx !== -1) buchungen.splice(idx, 1);
        this.render(container, buchungen, onChange);
        onChange(buchungen);
      });
    });

    container.querySelector(".zeitbuchung-add-btn")?.addEventListener("click", () => {
      const datum = datumInput?.value;
      const stunden = parseFloat(stundenInput?.value);

      if (!datum || !stunden || stunden <= 0) {
        if (typeof Anzeige !== "undefined") Anzeige.zeigeToast("Bitte Datum und Stunden (> 0) angeben.", true);
        return;
      }

      buchungen.push({ Id: neueId(), Datum: datum, Stunden: Math.round(stunden * 100) / 100 });
      this.render(container, buchungen, onChange);
      onChange(buchungen);
    });
  },
};

const LOKALE_EINSTELLUNGEN_KEY = "focus.lokaleEinstellungen.v1";

function anwendenDarkMode(value) {
  if (value === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (value === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

const LokaleEinstellungen = {
  _daten: null,

  _laden() {
    if (this._daten) return this._daten;
    try {
      const raw = localStorage.getItem(LOKALE_EINSTELLUNGEN_KEY);
      this._daten = raw ? JSON.parse(raw) : {};
    } catch {
      this._daten = {};
    }
    this._daten.bereichFarben ??= {};
    return this._daten;
  },

  _speichern() {
    localStorage.setItem(LOKALE_EINSTELLUNGEN_KEY, JSON.stringify(this._daten));
  },

  // Hinweis: Bereichsfarben werden seit der Datenbank-Migration über
  // Store.getBereichFarbe()/Store.setBereichFarbe() verwaltet und mit
  // Supabase synchronisiert. `bereichFarben` bleibt hier nur noch als
  // Lesequelle für die einmalige Migration bestehender lokaler Farben
  // (siehe Store._migriereLokaleBereichFarben) erhalten.

  getDarkMode() {
    return this._laden().darkMode ?? null;
  },

  setDarkMode(value) {
    const d = this._laden();
    d.darkMode = value;
    this._speichern();
    anwendenDarkMode(value);
  },
};

anwendenDarkMode(LokaleEinstellungen.getDarkMode());
