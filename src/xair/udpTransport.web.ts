// Navigateur : pas d'UDP. Sert seulement à l'aperçu (mode démo).
import { Remote, Transport } from './transport';
export class RnUdpTransport implements Transport {
  open(_onMessage: (bytes: Uint8Array, from: Remote) => void): Promise<void> { return Promise.resolve(); }
  send(): void {}
  close(): void {}
}
