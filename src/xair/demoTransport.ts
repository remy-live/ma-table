// « Table de démo » dans l'appli : imite une XR16 sans réseau, pour essayer
// les écrans n'importe où. Même interface que le vrai transport UDP.
import { decode, encode, OscArg, s } from '../osc/osc';
import { isUi, isX32 } from './addresses';
import { buildX32Meters, fromX32, toX32 } from './x32Wire';
import { TableModel } from './tableModel';
import { buildMeters } from './XAirClient';
import { Remote, Transport } from './transport';

const TABLE: Remote = { address: 'demo', port: 10024 };

/** Modèle imité par la démo (XR18, XR16, XR12…), choisi sur l'écran de connexion. */
let demoModel = 'XR18';
let current: DemoTransport | null = null;
/** Démo vide : une table neuve, sans noms, sans retours ni groupes. */
let demoEmpty = false;
export const setDemoEmpty = (on: boolean) => { demoEmpty = on; };
/** Barre de débogage : couper la liaison avec la table imitée (la table ne répond plus). */
let demoOffline = false;
export const setDemoOffline = (on: boolean) => { demoOffline = on; };
export const isDemoOffline = () => demoOffline;
const preampsOf = (m: string) => (isX32(m) ? 32 : isUi(m) ? 24 : /12/.test(m) ? 4 : /16/.test(m) ? 8 : 16);
const chansOf = (m: string) => (isX32(m) ? 32 : isUi(m) ? 24 : 16);
const familyOf = (m: string) => (isX32(m) ? 'x32' : isUi(m) ? 'ui' : 'xair');
/** Change la table imitée ; la démo en cours suit tout de suite (mêmes noms, mêmes réglages). */
export const setDemoModel = (m: string) => {
  demoModel = m;
  if (current) {
    // passer d'une X Air à une X32 (ou l'inverse) : une table neuve de la bonne taille
    if (familyOf(m) !== familyOf(current.name)) current.model = new TableModel(!demoEmpty, preampsOf(m), chansOf(m));
    current.name = m;
    current.model.preamps = preampsOf(m);
  }
};
export const getDemoModel = () => demoModel;

export class DemoTransport implements Transport {
  private onMessage: ((b: Uint8Array, from: Remote) => void) | null = null;
  name = demoModel;
  model = new TableModel(!demoEmpty, preampsOf(demoModel), chansOf(demoModel));
  constructor() { current = this; }
  private rtaTimer: ReturnType<typeof setInterval> | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;

  async open(onMessage: (b: Uint8Array, from: Remote) => void) {
    this.onMessage = onMessage;
  }

  send(bytes: Uint8Array) {
    if (demoOffline) return;
    const m0 = decode(bytes);
    if (!m0) return;
    // démo X32 : la table imitée parle « X Air » ; on traduit dans les deux sens, comme la vraie X32
    const x32 = isX32(this.name);
    let m = m0;
    if (x32 && m0.address !== '/xinfo' && m0.address !== '/xremote' && m0.address !== '/meters') {
      const t = fromX32(m0.address, m0.args);
      if (!t) return;
      m = { ...m0, address: t.path, args: t.args };
    }
    const answer = (path: string, args: OscArg[]) => setTimeout(() => {
      if (x32 && path !== '/xinfo') { const w = toX32(path, args); if (!w) return; this.onMessage?.(encode(w.path, w.args), TABLE); return; }
      this.onMessage?.(encode(path, args), TABLE);
    }, 2);
    if (m.address === '/xinfo') return answer('/xinfo', [s('demo'), s('Table de démo'), s(this.name), s('démo')]);
    if (m.address === '/xremote') return;
    if (m.address === '/meters' && String(m.args[0] ?? '') === '/meters/4') {
      // spectre factice : un peu de graves, une bosse dans les médiums, qui bouge
      if (!this.rtaTimer)
        this.rtaTimer = setInterval(() => {
          const t = Date.now() / 400;
          const db = Array.from({ length: 100 }, (_, k) => -38 - k * 0.22 + 10 * Math.exp(-((k - 38) ** 2) / 90) + 6 * Math.sin(t + k / 6) * Math.random());
          this.onMessage?.(encode('/meters/4', [{ t: 'b', v: buildMeters(db) }]), TABLE);
        }, 100);
      return;
    }
    if (m.address === '/meters') {
      if (!this.meterTimer)
        this.meterTimer = setInterval(() => {
          if (demoOffline) return;
          this.tick++;
          if (isX32(this.name)) {
            const { m0, m2 } = this.model.metersX32(this.tick);
            this.onMessage?.(encode('/meters/0', [{ t: 'b', v: buildX32Meters(m0) }]), TABLE);
            this.onMessage?.(encode('/meters/2', [{ t: 'b', v: buildX32Meters(m2) }]), TABLE);
          } else if (isUi(this.name)) {
            // démo Ui : même rangement que le traducteur Ui (voies 0-23, retours 30-39, L/R 44-45)
            const { m0, m2 } = this.model.metersX32(this.tick);
            const db = new Array(48).fill(-90);
            for (let c = 0; c < 24; c++) db[c] = m0[c];
            for (let b = 0; b < 10; b++) db[30 + b] = m0[48 + b];
            db[44] = m2[22];
            db[45] = m2[23];
            this.onMessage?.(encode('/meters/1', [{ t: 'b', v: buildMeters(db) }]), TABLE);
          } else this.onMessage?.(encode('/meters/1', [{ t: 'b', v: buildMeters(this.model.meters(this.tick)) }]), TABLE);
        }, 60);
      return;
    }
    if (m.args.length === 0) {
      const v = this.model.get(m.address);
      if (v) answer(m.address, [v]);
      return;
    }
    this.model.set(m.address, m.args[0]);
  }

  close() {
    if (this.meterTimer) clearInterval(this.meterTimer);
    if (this.rtaTimer) clearInterval(this.rtaTimer);
    this.meterTimer = null;
    this.rtaTimer = null;
    this.onMessage = null;
  }
}
