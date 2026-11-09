// Journal des changements : « 20 h 14 · Rémy a monté la basse de +2 dB dans
// son retour ». Les gestes rapprochés sur un même réglage sont regroupés.
import { OscValue } from '../osc/osc';
import { busNamePath, chNamePath, dcaNamePath, fToGainDb } from '../xair/addresses';
import { faderToDb } from '../xair/levels';
import { XAirClient } from '../xair/XAirClient';
import { load, save } from './persist';

export interface Entry {
  at: number;
  who: 'moi' | 'autre';
  text: string;
  path: string;
}

export const JOURNAL_MAX = 300;
const GROUP_MS = 2500;

const fmtDb = (v: OscValue) => {
  const d = faderToDb(Number(v));
  return !isFinite(d) ? '−∞' : (d > 0 ? '+' : '') + d.toFixed(1) + ' dB';
};

/** Phrase en clair pour un changement. `null` = pas la peine de noter (lecture, vumètre…). */
export function describe(client: XAirClient, path: string, value: OscValue, before: OscValue): string | null {
  const name = (c: string) => String(client.get(chNamePath(Number(c))) ?? '') || `voie ${Number(c)}`;
  const bus = (b: string) => String(client.get(busNamePath(Number(b))) ?? '') || `retour ${Number(b)}`;
  let m: RegExpExecArray | null;
  if ((m = /^\/ch\/(\d\d)\/mix\/fader$/.exec(path))) return `${name(m[1])} : façade ${fmtDb(before)} → ${fmtDb(value)}`;
  if ((m = /^\/ch\/(\d\d)\/mix\/(\d\d)\/level$/.exec(path))) {
    const n = Number(m[2]);
    return n <= 6 ? `${name(m[1])} dans « ${bus(m[2])} » : ${fmtDb(before)} → ${fmtDb(value)}` : `${name(m[1])} vers l’effet ${n - 6} : ${fmtDb(before)} → ${fmtDb(value)}`;
  }
  if ((m = /^\/ch\/(\d\d)\/mix\/on$/.exec(path))) return `${name(m[1])} : ${Number(value) === 1 ? 'réactivée' : 'coupée (mute)'}`;
  if ((m = /^\/ch\/(\d\d)\/config\/name$/.exec(path))) return `Voie ${Number(m[1])} renommée « ${String(value)} »`;
  if ((m = /^\/ch\/(\d\d)\/config\/insrc$/.exec(path))) return `${name(m[1])} écoute maintenant la prise ${Number(value) + 1}`;
  if ((m = /^\/ch\/(\d\d)\/grp\/dca$/.exec(path))) return `${name(m[1])} : groupes modifiés`;
  if ((m = /^\/ch\/(\d\d)\/eq\/on$/.exec(path))) return `${name(m[1])} : EQ ${Number(value) === 1 ? 'activé' : 'coupé'}`;
  if ((m = /^\/ch\/(\d\d)\/eq\/(\d)\/(g|f|q|type)$/.exec(path))) return `${name(m[1])} : EQ bande ${m[2]} réglée`;
  if ((m = /^\/ch\/(\d\d)\/(gate|dyn)\/on$/.exec(path))) return `${name(m[1])} : ${m[2] === 'gate' ? 'gate' : 'compresseur'} ${Number(value) === 1 ? 'activé' : 'coupé'}`;
  if ((m = /^\/ch\/(\d\d)\/(gate|dyn)\/thr$/.exec(path))) return `${name(m[1])} : seuil ${m[2] === 'gate' ? 'de la gate' : 'du compresseur'} réglé`;
  if ((m = /^\/ch\/(\d\d)\/preamp\/hpon$/.exec(path))) return `${name(m[1])} : coupe-bas ${Number(value) === 1 ? 'activé' : 'coupé'}`;
  if ((m = /^\/headamp\/(\d\d)\/gain$/.exec(path))) return `Prise ${Number(m[1])} : gain ${fToGainDb(Number(before)).toFixed(0)} → ${fToGainDb(Number(value)).toFixed(0)} dB`;
  if ((m = /^\/headamp\/(\d\d)\/phantom$/.exec(path))) return `Prise ${Number(m[1])} : 48 V ${Number(value) === 1 ? 'ALLUMÉ' : 'éteint'}`;
  if ((m = /^\/bus\/(\d)\/mix\/fader$/.exec(path))) return `Volume de « ${bus(m[1])} » : ${fmtDb(before)} → ${fmtDb(value)}`;
  if ((m = /^\/bus\/(\d)\/config\/name$/.exec(path))) return `Retour ${m[1]} renommé « ${String(value)} »`;
  if ((m = /^\/bus\/(\d)\/dyn\/on$/.exec(path))) return `« ${bus(m[1])} » : protège-oreilles ${Number(value) === 1 ? 'actif' : 'coupé'}`;
  if (path === '/lr/mix/fader') return `Volume général : ${fmtDb(before)} → ${fmtDb(value)}`;
  if (path === '/lr/mix/on') return Number(value) === 1 ? 'Façade rallumée' : 'FAÇADE COUPÉE (pause)';
  if ((m = /^\/dca\/(\d)\/fader$/.exec(path))) return `Groupe « ${String(client.get(dcaNamePath(Number(m[1]))) ?? '') || m[1]} » : ${fmtDb(before)} → ${fmtDb(value)}`;
  if ((m = /^\/dca\/(\d)\/config\/name$/.exec(path))) return `Groupe ${m[1]} renommé « ${String(value)} »`;
  if ((m = /^\/fx\/(\d)\/type$/.exec(path))) return `Effet ${m[1]} : type changé`;
  if ((m = /^\/rtn\/(\d)\/mix\/fader$/.exec(path))) return `Effet ${m[1]} dans la façade : ${fmtDb(before)} → ${fmtDb(value)}`;
  return null;
}

export class Journal {
  entries: Entry[] = [];
  private listeners = new Set<() => void>();
  private firstBefore = new Map<string, OscValue>();
  private off: (() => void) | null = null;
  private saveT: ReturnType<typeof setTimeout> | null = null;

  async start(client: XAirClient) {
    this.entries = (await load<Entry[]>('journal', [])) ?? [];
    this.off = client.onChange((path, value, before, who) => this.record(client, path, value, before, who));
  }
  stop() {
    this.off?.();
    this.off = null;
  }
  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Les gestes rapprochés sur la même adresse se regroupent en une ligne (avant → après final). */
  record(client: XAirClient, path: string, value: OscValue, before: OscValue, who: 'moi' | 'autre', now = Date.now()) {
    const last = this.entries[0];
    const grouped = last && last.path === path && last.who === who && now - last.at < GROUP_MS;
    const b0 = grouped ? this.firstBefore.get(path) ?? before : before;
    const text = describe(client, path, value, b0);
    if (!text) return;
    if (grouped) this.entries[0] = { ...last, at: now, text };
    else {
      this.firstBefore.set(path, before);
      this.entries = [{ at: now, who, text, path }, ...this.entries].slice(0, JOURNAL_MAX);
    }
    this.listeners.forEach((cb) => cb());
    if (this.saveT) clearTimeout(this.saveT);
    this.saveT = setTimeout(() => save('journal', this.entries), 1500);
  }

  async clear() {
    this.entries = [];
    await save('journal', []);
    this.listeners.forEach((cb) => cb());
  }

  /** Texte à partager. */
  asText(): string {
    return this.entries
      .slice()
      .reverse()
      .map((e) => `${new Date(e.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} ${e.who === 'moi' ? '[moi]' : '[autre appareil]'} ${e.text}`)
      .join('\n');
  }
}

export const journal = new Journal();
