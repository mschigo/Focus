/**
 * Focus Web – Datenmodell & Speicher (store.js).
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
      return;
    }

    this._daten = { Aufgaben: [], Projekte: [], Konfiguration: { Bereiche: ["Arbeit", "Privat"] } };
    await supabaseClient.from("focus_daten").insert({ user_id: userId, daten: this._daten });
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

      return {
        ...a,
        Bereich: projekt ? projekt.Bereich : "",
        ProjektName: projekt ? projekt.Name : "",
        IstAktiv: istAktiv,
        Checkliste: a.Checkliste || []
      };
    });
  },

  getBereiche() {
    this._pruefeGeladen();
    return this._daten.Konfiguration.Bereiche;
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

  addProjekt(bereich, name) {
    this._pruefeGeladen();
    const b = bereich.trim();
    const n = name.trim();

    const projekt = { Id: neueId(), Name: n, Bereich: b };
    this._daten.Projekte.push(projekt);
    this.speichern();
    return projekt;
  }
};
