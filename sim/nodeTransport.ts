// Transport UDP pour Node (simulateur et tests), même interface que sur le téléphone.
import dgram from 'node:dgram';
import { Remote, Transport } from '../src/xair/transport';

export class NodeUdpTransport implements Transport {
  private sock: dgram.Socket | null = null;
  constructor(private bindPort = 0) {}

  open(onMessage: (bytes: Uint8Array, from: Remote) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.sock = sock;
      sock.on('message', (msg, r) => onMessage(new Uint8Array(msg), { address: r.address, port: r.port }));
      sock.once('error', reject);
      sock.bind(this.bindPort, () => resolve());
    });
  }

  send(bytes: Uint8Array, host: string, port: number) {
    this.sock?.send(bytes, port, host);
  }

  setBroadcast(on: boolean) {
    this.sock?.setBroadcast(on);
  }

  close() {
    this.sock?.close();
    this.sock = null;
  }
}
