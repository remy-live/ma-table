// « Table de démo » dans l'appli : imite une XR16 sans réseau, pour essayer
// les écrans n'importe où. Même interface que le vrai transport UDP.
import { decode, encode, OscArg, s } from '../osc/osc';
import { TableModel } from './tableModel';
import { buildMeters } from './XAirClient';
import { Remote, Transport } from './transport';

const TABLE: Remote = { address: 'demo', port: 10024 };

/** Modèle imité par la démo (XR18, XR16, XR12…), choisi sur l'écran de connexion. */
let demoModel = 'XR18';
export const setDemoModel = (m: string) => { demoModel = m; };
export const getDemoModel = () => demoModel;

export class DemoTransport implements Transport {
  private onMessage: ((b: Uint8Array, from: Remote) => void) | null = null;
  private name = demoModel;
  private model = new TableModel(true, /12/.test(demoModel) ? 4 : /16/.test(demoModel) ? 8 : 16);
  private rtaTimer: ReturnType<typeof setInterval> | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;

  async open(onMessage: (b: Uint8Array, from: Remote) => void) {
    this.onMessage = onMessage;
  }

  send(bytes: Uint8Array) {
    const m = decode(bytes);
    if (!m) return;
    const answer = (path: string, args: OscArg[]) => setTimeout(() => this.onMessage?.(encode(path, args), TABLE), 2);
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
          this.tick++;
          this.onMessage?.(encode('/meters/1', [{ t: 'b', v: buildMeters(this.model.meters(this.tick)) }]), TABLE);
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
