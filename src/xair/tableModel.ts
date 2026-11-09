// Modèle d'une XR16 imitée, partagé par le simulateur du Mac et le mode démo.
// Il répond à toutes les adresses utilisées par l'appli avec des valeurs crédibles.
import { f, i, OscArg, s } from '../osc/osc';
import { ch2 } from './levels';

const NAMES = ['Voix', 'Guitare acou', 'Guitare élec', 'Basse', 'Kick', 'Caisse claire', 'Charley', 'Toms', 'Overhead'];

export class TableModel {
  state = new Map<string, OscArg>();

  constructor(demo = true) {
    this.state.set('/lr/mix/fader', f(0.75));
    this.state.set('/lr/mix/on', i(1));
    for (let c = 1; c <= 16; c++) {
      const n = ch2(c);
      this.state.set(`/ch/${n}/config/name`, s(demo ? NAMES[c - 1] ?? '' : ''));
      this.state.set(`/ch/${n}/mix/fader`, f(demo && c <= 9 ? 0.7 : 0));
      // Démo : les voies 5 à 9 sont dans le groupe DCA 1 « Batterie »
      this.state.set(`/ch/${n}/grp/dca`, i(demo && c >= 5 && c <= 9 ? 1 : 0));
      this.state.set(`/ch/${n}/mix/01/level`, f(demo && c <= 9 ? 0.55 : 0));
      this.state.set(`/ch/${n}/mix/02/level`, f(demo && c <= 3 ? 0.65 : 0));
    }
    if (demo) {
      this.state.set('/dca/1/config/name', s('Batterie'));
      this.state.set('/bus/1/config/name', s('Bassiste'));
      this.state.set('/bus/2/config/name', s('Mon retour'));
      [5, 10, 13, 3].forEach((t, k) => this.state.set(`/fx/${k + 1}/type`, i(t))); // plaque, écho, chorus, pièce
    }
  }

  /** Valeur par défaut pour une adresse jamais réglée (comme une table neuve). */
  defaultFor(path: string): OscArg | null {
    const ha = /^\/headamp\/(\d\d)\/(gain|phantom)$/.exec(path);
    if (ha) {
      if (Number(ha[1]) > 8) return null; // XR16 : préamplis micro sur les entrées 1 à 8 seulement
      return ha[2] === 'gain' ? f(0.5) : i(0);
    }
    if (path.endsWith('/preamp/invert')) return i(0);
    if (path.startsWith('/-prefs/is/')) {
      if (path.endsWith('/ssid') || path.endsWith('/key')) return s('');
      if (path.endsWith('/security')) return i(3);
      if (path.endsWith('/mode')) return i(0);
    }
    if (path.startsWith('/config/chlink/')) return i(0);
    if (path.endsWith('/dyn/ratio')) return i(4);
    if (path.endsWith('/dyn/attack')) return f(0.1);
    if (!path.startsWith('/ch/') && !path.startsWith('/bus/') && !path.startsWith('/dca/') &&
        !path.startsWith('/rtn/') && !path.startsWith('/fx/') && !path.startsWith('/fxsend/') && !path.startsWith('/lr/')) return null;
    if (path.endsWith('/config/name')) return s('');
    if (path.endsWith('/config/color')) return i(0);
    if (path.endsWith('/grp/dca') || path.endsWith('/type')) return i(path.includes('/eq/') ? 2 : 0);
    if (/\/(hpon|gate\/on|dyn\/on)$/.test(path)) return i(0);
    if (path.endsWith('/on')) return i(1);
    if (path.endsWith('/level')) return f(0);
    if (path.endsWith('/fader')) return f(0.75);
    if (path.endsWith('/eq/1/f')) return f(0.3);
    if (path.endsWith('/eq/2/f')) return f(0.45);
    if (path.endsWith('/eq/3/f')) return f(0.65);
    if (path.endsWith('/eq/4/f')) return f(0.85);
    return f(0.5);
  }

  get(path: string): OscArg | null {
    const v = this.state.get(path) ?? this.defaultFor(path);
    if (v && !this.state.has(path)) this.state.set(path, v);
    return v;
  }

  /** Vumètres imités : chaque voie « joue » selon son fader, son mute et son gain. */
  meters(tick: number): number[] {
    const out = new Array(40).fill(-90);
    let lr = -90;
    for (let c = 1; c <= 16; c++) {
      const n = c < 10 ? '0' + c : String(c);
      const on = Number(this.get(`/ch/${n}/mix/on`)?.v ?? 1) === 1;
      const fader = Number(this.get(`/ch/${n}/mix/fader`)?.v ?? 0);
      const gain = c <= 8 ? (Number(this.get(`/headamp/${n}/gain`)?.v ?? 0.5) * 72 - 12) : 20;
      if (fader <= 0) continue;
      const wob = Math.abs(Math.sin(tick * 0.31 + c * 1.7) * Math.cos(tick * 0.07 + c));
      const pre = -42 + (gain - 20) * 0.8 + 30 * wob; // le gain fait monter le vumètre d'entrée
      out[c - 1] = Math.min(2, pre);
      if (on) lr = Math.max(lr, pre + (fader * 40 - 30));
    }
    for (let b = 1; b <= 6; b++) out[25 + b] = lr > -90 ? lr - 8 - b : -90;
    out[36] = Math.min(6, lr);
    out[37] = Math.min(6, lr - 1);
    return out;
  }

  /** Applique une valeur reçue, en gardant le type de l'adresse. */
  set(path: string, v: unknown): OscArg | null {
    const cur = this.get(path);
    if (!cur) return null;
    const next = cur.t === 's' ? s(String(v)) : cur.t === 'i' ? i(Number(v)) : f(Number(v));
    this.state.set(path, next);
    return next;
  }
}
