// Transport UDP natif pour iPhone / Android (module react-native-udp).
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import { Remote, Transport } from './transport';

type Sock = ReturnType<typeof dgram.createSocket>;

export class RnUdpTransport implements Transport {
  private sock: Sock | null = null;

  open(onMessage: (bytes: Uint8Array, from: Remote) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reusePort: true });
      this.sock = sock;
      sock.on('message', (msg: Buffer, r: { address: string; port: number }) =>
        onMessage(new Uint8Array(msg), { address: r.address, port: r.port }),
      );
      sock.once('error', (e: unknown) => reject(e));
      sock.once('listening', () => resolve());
      sock.bind(0);
    });
  }

  send(bytes: Uint8Array, host: string, port: number) {
    const b = Buffer.from(bytes);
    this.sock?.send(b, 0, b.length, port, host, () => {});
  }

  setBroadcast(on: boolean) {
    this.sock?.setBroadcast(on);
  }

  close() {
    try {
      this.sock?.close();
    } catch {
      // déjà fermé
    }
    this.sock = null;
  }
}
