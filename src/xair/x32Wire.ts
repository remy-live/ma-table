// Traduction X Air ⇄ X32 / M32.
// Toute l'appli parle « X Air » (les adresses OSC de la XR18). Pour une X32,
// le client traduit au moment d'envoyer et de recevoir. Les deux tables sont
// cousines : la plupart des adresses sont identiques (/ch/NN/mix/fader,
// /ch/NN/eq/…, /dca/N/…), seules quelques-unes changent :
//
//   X Air                         X32
//   /lr/…                         /main/st/…
//   /bus/3/…                      /bus/03/…
//   /headamp/05/…                 /headamp/004/…        (numérotées à partir de 000)
//   /ch/NN/mix/lr                 /ch/NN/mix/st
//   /ch/NN/config/insrc  (0 = prise 1)   /ch/NN/config/source  (1 = In 01, 0 = rien)
//   /rtn/aux/…                    /auxin/01/…
//   /rtn/N/…  (retour FX N)       /fxrtn/0(2N-1)/…
//   /fxsend/N/…                   /bus/(12+N)/…         (les bus 13-16 servent aux effets)
//   /-snap/load                   /-action/goscene
//
// Vérifié contre l'émulateur X32 de Patrick-Gilles Maillot (toutes ces adresses y répondent).
import { OscArg, OscValue } from '../osc/osc';

const p2 = (n: number) => String(n).padStart(2, '0');
const p3 = (n: number) => String(n).padStart(3, '0');

export function toX32(path: string, args: OscArg[]): { path: string; args: OscArg[] } | null {
  let m: RegExpMatchArray | null;
  if (path.startsWith('/lr/')) return { path: '/main/st/' + path.slice(4), args };
  if ((m = path.match(/^\/bus\/(\d+)\/(.*)$/))) return { path: `/bus/${p2(Number(m[1]))}/${m[2]}`, args };
  if ((m = path.match(/^\/headamp\/(\d+)\/(.*)$/))) return { path: `/headamp/${p3(Number(m[1]) - 1)}/${m[2]}`, args };
  if ((m = path.match(/^\/ch\/(\d\d)\/mix\/lr$/))) return { path: `/ch/${m[1]}/mix/st`, args };
  if ((m = path.match(/^\/ch\/(\d\d)\/config\/insrc$/))) {
    return { path: `/ch/${m[1]}/config/source`, args: args.map((a) => ({ t: 'i', v: Number(a.v) + 1 })) as OscArg[] };
  }
  if (path.startsWith('/rtn/aux/')) return { path: '/auxin/01/' + path.slice(9), args };
  if ((m = path.match(/^\/rtn\/(\d)\/(.*)$/))) return { path: `/fxrtn/${p2(2 * Number(m[1]) - 1)}/${m[2]}`, args };
  if ((m = path.match(/^\/fxsend\/(\d)\/(.*)$/))) return { path: `/bus/${p2(12 + Number(m[1]))}/${m[2]}`, args };
  if (path === '/-snap/load') return { path: '/-action/goscene', args };
  if (path.startsWith('/-snap/')) return null; // pas d'équivalent direct : on n'envoie rien
  return { path, args };
}

export function fromX32(path: string, args: OscValue[]): { path: string; args: OscValue[] } | null {
  let m: RegExpMatchArray | null;
  if (path.startsWith('/main/st/')) return { path: '/lr/' + path.slice(9), args };
  if (path.startsWith('/main/m/')) return null;
  if ((m = path.match(/^\/bus\/(\d\d)\/(.*)$/))) {
    const b = Number(m[1]);
    return b >= 13 ? { path: `/fxsend/${b - 12}/${m[2]}`, args } : { path: `/bus/${b}/${m[2]}`, args };
  }
  if ((m = path.match(/^\/headamp\/(\d{3})\/(.*)$/))) {
    const h = Number(m[1]) + 1;
    return h <= 32 ? { path: `/headamp/${p2(h)}/${m[2]}`, args } : null;
  }
  if ((m = path.match(/^\/ch\/(\d\d)\/mix\/st$/))) return { path: `/ch/${m[1]}/mix/lr`, args };
  if ((m = path.match(/^\/ch\/(\d\d)\/config\/source$/))) return { path: `/ch/${m[1]}/config/insrc`, args: args.map((v) => Math.max(0, Number(v) - 1)) };
  if (path.startsWith('/auxin/01/')) return { path: '/rtn/aux/' + path.slice(10), args };
  if ((m = path.match(/^\/fxrtn\/(\d\d)\/(.*)$/))) {
    const r = Number(m[1]);
    return r % 2 === 1 && r <= 7 ? { path: `/rtn/${(r + 1) / 2}/${m[2]}`, args } : null;
  }
  return { path, args };
}

/** Vumètres X32 : un entier (nombre de valeurs) puis des réels 32 bits, linéaires (1 = 0 dB). */
export function parseX32Meters(blob: Uint8Array, out: Float32Array, at: number, from = 0, count?: number): boolean {
  if (blob.length < 8) return false;
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  let n = dv.getInt32(0, true);
  if (n <= 0 || n > 512) n = (blob.length - 4) >> 2;
  n = Math.min(n, (blob.length - 4) >> 2);
  const take = Math.min(count ?? n - from, n - from);
  for (let k = 0; k < take && at + k < out.length; k++) {
    const v = dv.getFloat32(4 + 4 * (from + k), true);
    out[at + k] = v > 1e-6 ? Math.max(-90, 20 * Math.log10(v)) : -90;
  }
  return take > 0;
}

/** Fabrique un bloc de vumètres X32 (démo, tests). */
export function buildX32Meters(db: number[]): Uint8Array {
  const b = new Uint8Array(4 + 4 * db.length);
  const dv = new DataView(b.buffer);
  dv.setInt32(0, db.length, true);
  db.forEach((v, k) => dv.setFloat32(4 + 4 * k, v <= -90 ? 0 : Math.pow(10, v / 20), true));
  return b;
}
