// « Table de démo » dans l'appli : imite une XR16 sans réseau, pour essayer
// les écrans n'importe où. Même interface que le vrai transport UDP.
import { decode, encode, OscArg, s } from '../osc/osc';
import { TableModel } from './tableModel';
import { buildMeters } from './XAirClient';
import { Remote, Transport } from './transport';

const TABLE: Remote = { address: 'demo', port: 10024 };

export class DemoTransport implements Transport {
  private onMessage: ((b: Uint8Array, from: Remote) => void) | null = null;
  private model = new TableModel(true);
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;

  async open(onMessage: (b: Uint8Array, from: Remote) => void) {
    this.onMessage = onMessage;
  }

  send(bytes: Uint8Array) {
    const m = decode(bytes);
    if (!m) return;
    const answer = (path: string, args: OscArg[]) => setTimeout(() => this.onMessage?.(encode(path, args), TABLE), 2);
    if (m.address === '/xinfo') return answer('/xinfo', [s('demo'), s('Table de démo'), s('XR16'), s('démo')]);
    if (m.address === '/xremote') return;
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
    this.meterTimer = null;
    this.onMessage = null;
  }
}
