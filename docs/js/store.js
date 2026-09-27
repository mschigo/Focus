/**
 * Focus Web – Datenmodell & Speicher.
 *
 * Datenformat entspricht exakt der aufgaben.json aus der MAUI-App
 * (siehe Models/AufgabeDto.cs, Models/Projekt.cs, Models/AufgabenDatenDatei.cs) –
 * die kompletten Daten liegen als ein JSON-Objekt in der Spalte "daten" einer
 * Zeile der Supabase-Tabelle "focus_daten" (eine Zeile pro angemeldetem Nutzer,
 * per Row-Level-Security abgesichert, siehe SQL aus dem Setup-Schritt).
 *
 * Architektur: Nach dem Login wird die Zeile einmal geladen und in einem
 * In-Memory-Zwischenspeicher (Store._daten) gehalten. Lesefunktionen
 * (getAufgaben/getBereiche/getProjekte) bleiben dadurch synchron und einfach
 * zu benutzen. Schreibende Funktionen aktualisieren den Zwischenspeicher
 * sofort (für eine reaktionsschnelle UI) und schreiben im Hintergrund nach
 * Supabase durch.
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

function leereDaten() {
  return { Aufgaben: [], Projekte: [], Konfiguration: { Bereiche: [] } };
}

/** Beispieldaten für eine frisch angelegte Nutzer-Zeile. */
function demoDaten() {
  const bereichPersoenlich = "Privat";
  const bereichArbeit = "Arbeit";

  const projektAllgemein = { Id: neueId(), Name: "Allgemein", Bereich: bereichArbeit };
  const projektHaushalt = { Id: neueId(), Name: "Haushalt", Bereich: bereichPersoenlich };

  const heute = heuteIso();

  return {
    Aufgaben: [
      {
        Id: neueId(),
        Titel: "Willkommen bei Focus!",
        ProjektId: projektAllgemein.Id,
        Prioritaet: Prioritaet.P2Wichtig,
        Status: AufgabenStatus.Offen,
        Faelligkeit: heute,
        Notizen: "Das ist eine Beispielaufgabe. Lege eigene Aufgaben über 'Aufgaben' an (folgt im nächsten Schritt).",
        Link: "",
        Checkliste: [],
        ErstelltAm: nowIso(),
        GeaendertAm: nowIso(),
      },
      {
        Id: neueId(),
        Titel: "Einkaufsliste schreiben",
        ProjektId: projektHaushalt.Id,
        Prioritaet: Prioritaet.P3Normal,
        Status: AufgabenStatus.Offen,
        Faelligkeit: null,
        Notizen: "",
        Link: "",
        Checkliste: [],
        ErstelltAm: nowIso(),
        GeaendertAm: nowIso(),
      },
    ],
    Projekte: [projektAllgemein, projektHaushalt],
    Konfiguration: { Bereiche: [bereichArbeit, bereichPersoenlich] },
  };
}

function normalisiereDaten(parsed) {
  return {
    Aufgaben: Array.isArray(parsed?.Aufgaben) ? parsed.Aufgaben : [],
    Projekte: Array.isArray(parsed?.Projekte) ? parsed.Projekte : [],
    Konfiguration: { Bereiche: Array.isArray(parsed?.Konfiguration?.Bereiche) ? parsed.Konfiguration.Bereiche : [] },
  };
}

const Store = {
  _daten: null,
  _userId: null,
  _authCallbacks: [],

  // ---------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------

  onAuthChange(callback) {
    this._authCallbacks.push(callback);
  },

  _notifyAuthChange(eingeloggt) {
    for (const cb of this._authCallbacks) {
      try {
        cb(eingeloggt);
      } catch (err) {
        console.error("Focus: Fehler in Auth-Callback.", err);
      }
    }
  },

  async starteAuthUeberwachung() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      console.error("Focus: Fehler beim Prüfen der Sitzung.", error);
    }

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
          Anzeige.zeigeToast("Daten konnten nicht geladen werden: " + err.message, true);
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
      return;
    }

    // Erste Anmeldung dieses Nutzers: Zeile mit Beispieldaten anlegen.
    this._daten = demoDaten();
    const { error: insertError } = await supabaseClient
      .from("focus_daten")
      .insert({ user_id: userId, daten: this._daten });

    if (insertError) throw insertError;
  },

  // ---------------------------------------------------------------
  // Speichern (Zwischenspeicher sofort, Supabase im Hintergrund)
  // ---------------------------------------------------------------

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

    if (error) {
      console.error("Focus: Fehler beim Speichern in Supabase.", error);
      Anzeige.zeigeToast("Speichern fehlgeschlagen (offline?): " + error.message, true);
    }
  },

  _pruefeGeladen() {
    if (!this._daten) {
      throw new Error("Daten sind noch nicht geladen. Bitte zuerst anmelden.");
    }
  },

  // ---------------------------------------------------------------
  // Lesen
  // ---------------------------------------------------------------

  /** Alle Aufgaben inkl. aufgelöster Anzeigefelder Bereich/ProjektName. */
  getAufgaben() {
    this._pruefeGeladen();

    const projektLookup = new Map(this._daten.Projekte.map((p) => [p.Id, p]));
    const heute = heuteIso();

    return this._daten.Aufgaben.map((a) => {
      const projekt = projektLookup.get(a.ProjektId);
      const istAktiv = a.Status === AufgabenStatus.Offen || a.Status === AufgabenStatus.InArbeit;
      const istUeberfaellig = !!a.Faelligkeit && a.Faelligkeit < heute && istAktiv;

      return {
        ...a,
        Bereich: projekt ? projekt.Bereich : "",
        ProjektName: projekt ? projekt.Name : "",
        IstAktiv: istAktiv,
        IstAbgeschwaecht: a.Status === AufgabenStatus.Erledigt,
        IstUeberfaellig: istUeberfaellig,
      };
    });
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

  // ---------------------------------------------------------------
  // Schreiben – Aufgaben
  // ---------------------------------------------------------------

  addOrUpdateAufgabe(aufgabe) {
    this._pruefeGeladen();

    if (!aufgabe.ProjektId || !this._daten.Projekte.some((p) => p.Id === aufgabe.ProjektId)) {
      throw new Error("Die Aufgabe muss einem gültigen Projekt zugeordnet sein.");
    }

    const now = nowIso();
    const index = this._daten.Aufgaben.findIndex((a) => a.Id === aufgabe.Id);

    if (index === -1) {
      const neu = {
        Id: aufgabe.Id || neueId(),
        Titel: aufgabe.Titel,
        ProjektId: aufgabe.ProjektId,
        Prioritaet: aufgabe.Prioritaet || Prioritaet.P3Normal,
        Status: aufgabe.Status || AufgabenStatus.Offen,
        Faelligkeit: aufgabe.Faelligkeit || null,
        Notizen: aufgabe.Notizen || "",
        Link: aufgabe.Link || "",
        Checkliste: aufgabe.Checkliste || [],
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
        Faelligkeit: aufgabe.Faelligkeit || null,
        Notizen: aufgabe.Notizen || "",
        Link: aufgabe.Link || "",
        Checkliste: aufgabe.Checkliste || [],
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

  endgueltigLoeschen(id) {
    this._pruefeGeladen();
    this._daten.Aufgaben = this._daten.Aufgaben.filter((a) => a.Id !== id);
    this.speichern();
  },

  /** Löscht alle erledigten Aufgaben endgültig. Gibt die Anzahl gelöschter Aufgaben zurück. */
  loescheErledigteAufgaben() {
    this._pruefeGeladen();

    const anzahlVorher = this._daten.Aufgaben.length;
    this._daten.Aufgaben = this._daten.Aufgaben.filter((a) => a.Status !== AufgabenStatus.Erledigt);
    const anzahlGeloescht = anzahlVorher - this._daten.Aufgaben.length;

    if (anzahlGeloescht > 0) this.speichern();
    return anzahlGeloescht;
  },

  // ---------------------------------------------------------------
  // Schreiben – Bereiche & Projekte
  // ---------------------------------------------------------------

  addBereich(name) {
    this._pruefeGeladen();
    if (!name || !name.trim()) return;

    const n = name.trim();
    if (this._daten.Konfiguration.Bereiche.some((b) => (b || "").trim().toLowerCase() === n.toLowerCase())) return;

    this._daten.Konfiguration.Bereiche.push(n);
    this.speichern();
  },

  addProjekt(bereich, name) {
    this._pruefeGeladen();

    if (!bereich || !bereich.trim()) throw new Error("Bereich ist erforderlich.");
    if (!name || !name.trim()) throw new Error("Projektname ist erforderlich.");

    const b = bereich.trim();
    const n = name.trim();

    if (!this._daten.Konfiguration.Bereiche.some((x) => (x || "").trim().toLowerCase() === b.toLowerCase())) {
      throw new Error(`Der Bereich "${b}" existiert nicht.`);
    }

    if (this._daten.Projekte.some((p) => p.Bereich.toLowerCase() === b.toLowerCase() && p.Name.toLowerCase() === n.toLowerCase())) {
      throw new Error(`Im Bereich "${b}" existiert bereits ein Projekt mit diesem Namen.`);
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

    this.speichern();
  },

  deleteBereich(name) {
    this._pruefeGeladen();
    if (!name || !name.trim()) return;

    const n = name.trim();

    if (this._daten.Projekte.some((p) => p.Bereich.toLowerCase() === n.toLowerCase())) {
      throw new Error(`Der Bereich "${n}" hat noch Projekte und kann nicht gelöscht werden.`);
    }

    this._daten.Konfiguration.Bereiche = this._daten.Konfiguration.Bereiche.filter(
      (b) => (b || "").trim().toLowerCase() !== n.toLowerCase()
    );
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

    // Alle Aufgaben, die zu diesem Projekt gehören, werden mitgelöscht (kein Papierkorb) –
    // wie in der MAUI-App.
    this._daten.Aufgaben = this._daten.Aufgaben.filter((a) => a.ProjektId !== projektId);
    this._daten.Projekte = this._daten.Projekte.filter((p) => p.Id !== projektId);
    this.speichern();
  },

  // ---------------------------------------------------------------
  // Import / Export (weiterhin nützlich als Backup bzw. zum Übertragen
  // aus/in die MAUI-App)
  // ---------------------------------------------------------------

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

// ---------------------------------------------------------------
// Gemeinsame Anzeige-Helfer (von mehreren Views genutzt)
// ---------------------------------------------------------------

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

// ---------------------------------------------------------------
// Lokale (geräteweise) Einstellungen – entspricht AppSettingsService.cs /
// Preferences in der MAUI-App: Bereichsfarben und Dark-Mode-Wahl werden
// bewusst NICHT über Supabase synchronisiert, sondern pro Gerät im
// Browser gespeichert, genau wie in der Windows-App.
// ---------------------------------------------------------------

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

  getBereichFarbe(bereichName) {
    if (!bereichName) return "";
    return this._laden().bereichFarben[bereichName.trim()] || "";
  },

  setBereichFarbe(bereichName, hex) {
    if (!bereichName || !bereichName.trim()) return;
    const d = this._laden();
    const key = bereichName.trim();

    if (!hex) {
      delete d.bereichFarben[key];
    } else {
      d.bereichFarben[key] = hex;
    }

    this._speichern();
  },

  renameBereichFarbe(alterName, neuerName) {
    if (!alterName || !neuerName) return;
    const d = this._laden();
    const alt = alterName.trim();
    const neu = neuerName.trim();

    if (d.bereichFarben[alt] === undefined) return;

    d.bereichFarben[neu] = d.bereichFarben[alt];
    delete d.bereichFarben[alt];
    this._speichern();
  },

  removeBereichFarbe(bereichName) {
    if (!bereichName) return;
    const d = this._laden();
    const key = bereichName.trim();

    if (d.bereichFarben[key] === undefined) return;

    delete d.bereichFarben[key];
    this._speichern();
  },

  /** null = folgt Systemeinstellung, sonst "dark" oder "light". */
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

// Sofort beim Laden anwenden, damit die Seite nicht kurz im falschen Theme aufblitzt.
anwendenDarkMode(LokaleEinstellungen.getDarkMode());
