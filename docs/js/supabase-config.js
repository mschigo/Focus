/**
 * Supabase-Zugangsdaten für die Focus Web-App.
 *
 * Der "Publishable Key" ist bewusst öffentlich nutzbar (Supabase selbst nennt
 * ihn "safe to use in a browser, if you have enabled Row Level Security") –
 * die eigentliche Absicherung passiert über die RLS-Regeln der Tabelle
 * "focus_daten" in Supabase, NICHT durch Geheimhaltung dieses Keys.
 *
 * Der "Secret Key" (früher service_role) darf niemals hier eingetragen
 * werden – der hätte vollen, ungeschützten Zugriff auf die Datenbank.
 */
const SUPABASE_URL = "https://xkvcbsuvfivxxhxukqqv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ObuQg5_hF_Upc_kFYKyhdw_esvvIn7o";
