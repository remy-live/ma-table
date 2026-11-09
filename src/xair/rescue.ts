// « Au secours » : couper un larsen d'un coup, puis revenir.
// Baisse tous les retours (bus) de `db`, garde la façade. Réversible.
import { f } from '../osc/osc';
import { BUS_COUNT, busNamePath, CH_COUNT, chLevelPath, MAIN } from './addresses';
import { dbToFader, faderToDb } from './levels';
import { XAirClient } from './XAirClient';

export interface RescueState {
  at: number;
  before: Record<string, number>;
}

export function rescue(client: XAirClient, db = -6): RescueState {
  const before: Record<string, number> = {};
  for (let b = 1; b <= BUS_COUNT; b++) {
    const p = `/bus/${b}/mix/fader`;
    const cur = Number(client.get(p) ?? 0.75);
    before[p] = cur;
    const d = faderToDb(cur);
    client.set(p, f(isFinite(d) ? dbToFader(d + db) : 0));
  }
  return { at: Date.now(), before };
}

export function unrescue(client: XAirClient, st: RescueState) {
  for (const [p, v] of Object.entries(st.before)) client.set(p, f(v));
}

// ---------- Check-list avant concert ----------
export interface Check {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
}

export function checklist(client: XAirClient, opts: { balanceSaved: boolean; sessionSaved: boolean; wifiClient: boolean | null; limiters: number; namedReturns: number }): Check[] {
  const named = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => String(client.get(`/ch/${String(c).padStart(2, '0')}/config/name`) ?? '')).length;
  const heard = Array.from({ length: CH_COUNT }, (_, k) => k + 1).filter((c) => Number(client.get(chLevelPath(c, MAIN)) ?? 0) > 0).length;
  const returnsNamed = Array.from({ length: BUS_COUNT }, (_, k) => k + 1).filter((b) => String(client.get(busNamePath(b)) ?? '')).length;
  const lrOn = Number(client.get('/lr/mix/on') ?? 1) === 1;
  return [
    { id: 'link', label: 'Table connectée', ok: client.status === 'connecté', hint: 'Vérifie le Wi-Fi du téléphone et celui de la table' },
    { id: 'wifi', label: 'Table sur ton réseau (WIFI CLIENT)', ok: opts.wifiClient !== false, hint: opts.wifiClient === null ? 'Inconnu : regarde l’interrupteur REMOTE à l’arrière' : 'Interrupteur REMOTE → WIFI CLIENT, puis Connexion › Réseau' },
    { id: 'names', label: `Voies nommées (${named})`, ok: named >= 2, hint: 'Outils › Mode guidé, étape 1' },
    { id: 'heard', label: `Le public entend ${heard} voie${heard > 1 ? 's' : ''}`, ok: heard >= 1 && lrOn, hint: lrOn ? 'Monte les faders de la façade' : 'La façade est coupée (pause) : « Reprendre le son »' },
    { id: 'returns', label: `Retours nommés (${returnsNamed})`, ok: returnsNamed >= 1 || opts.namedReturns === 0, hint: 'Mode guidé, étape 3 : qui écoute chaque AUX' },
    { id: 'lim', label: `Protège-oreilles sur les casques (${opts.limiters})`, ok: opts.limiters > 0 || returnsNamed === 0, hint: 'Inviter un musicien : le protège-oreilles s’active sur son retour' },
    { id: 'balance', label: 'Balance enregistrée', ok: opts.balanceSaved, hint: 'Scène › Enregistrer la balance (ou fin de la balance automatique)' },
    { id: 'session', label: 'Soirée enregistrée', ok: opts.sessionSaved, hint: 'Outils › Mes soirées › Enregistrer maintenant' },
  ];
}
