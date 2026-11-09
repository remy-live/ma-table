// Encodeur / décodeur OSC minimal, sans dépendance (Uint8Array + DataView).
// Suffisant pour les tables Behringer X Air (XR12/XR16/XR18) : types i, f, s, b.

export type OscArg =
  | { t: 'i'; v: number }
  | { t: 'f'; v: number }
  | { t: 's'; v: string }
  | { t: 'b'; v: Uint8Array };

export type OscValue = number | string | Uint8Array;

export interface OscMessage {
  address: string;
  args: OscValue[];
  types: string; // ex. "f", "ssss"
}

export const i = (v: number): OscArg => ({ t: 'i', v });
export const f = (v: number): OscArg => ({ t: 'f', v });
export const s = (v: string): OscArg => ({ t: 's', v });

const pad4 = (n: number) => (n + 3) & ~3;

function utf8Encode(str: string): Uint8Array {
  // TextEncoder existe sous Hermes récent et sous Node ; repli ASCII sinon.
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const out = new Uint8Array(str.length);
  for (let k = 0; k < str.length; k++) out[k] = str.charCodeAt(k) & 0x7f;
  return out;
}

function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let r = '';
  for (let k = 0; k < bytes.length; k++) r += String.fromCharCode(bytes[k]);
  return r;
}

function oscString(str: string): Uint8Array {
  const raw = utf8Encode(str);
  const out = new Uint8Array(pad4(raw.length + 1)); // +1 pour le zéro final
  out.set(raw, 0);
  return out;
}

export function encode(address: string, args: OscArg[] = []): Uint8Array {
  const parts: Uint8Array[] = [oscString(address), oscString(',' + args.map((a) => a.t).join(''))];
  for (const a of args) {
    if (a.t === 'i' || a.t === 'f') {
      const b = new Uint8Array(4);
      const dv = new DataView(b.buffer);
      if (a.t === 'i') dv.setInt32(0, a.v | 0, false);
      else dv.setFloat32(0, a.v, false);
      parts.push(b);
    } else if (a.t === 's') {
      parts.push(oscString(a.v));
    } else {
      const b = new Uint8Array(4 + pad4(a.v.length));
      new DataView(b.buffer).setInt32(0, a.v.length, false);
      b.set(a.v, 4);
      parts.push(b);
    }
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function readString(bytes: Uint8Array, off: number): [string, number] {
  let end = off;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return [utf8Decode(bytes.subarray(off, end)), pad4(end + 1)];
}

/** Décode un message OSC. Renvoie null pour un bundle ou un paquet invalide. */
export function decode(bytes: Uint8Array): OscMessage | null {
  try {
    if (bytes.length < 4 || bytes[0] !== 0x2f /* '/' */) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let [address, off] = readString(bytes, 0);
    if (off >= bytes.length) return { address, args: [], types: '' };
    let tags: string;
    [tags, off] = readString(bytes, off);
    if (tags[0] !== ',') return { address, args: [], types: '' };
    const types = tags.slice(1);
    const args: OscValue[] = [];
    for (const t of types) {
      if (t === 'i') {
        args.push(dv.getInt32(off, false));
        off += 4;
      } else if (t === 'f') {
        args.push(dv.getFloat32(off, false));
        off += 4;
      } else if (t === 's') {
        let str: string;
        [str, off] = readString(bytes, off);
        args.push(str);
      } else if (t === 'b') {
        const len = dv.getInt32(off, false);
        args.push(bytes.slice(off + 4, off + 4 + len));
        off += 4 + pad4(len);
      } else {
        // Type inconnu : on s'arrête proprement.
        break;
      }
    }
    return { address, args, types };
  } catch {
    return null;
  }
}
