// Simulateur de table XR16 : répond comme la vraie table sur le port 10024.
// Lancer sur le Mac :   npx tsx sim/xr16-sim.ts            (table muette)
//                       npx tsx sim/xr16-sim.ts --bouge    (quelqu'un bouge la voie 1)
// Puis dans l'appli, se connecter à l'adresse IP du Mac.

import { decode, encode, f, OscArg, s } from '../src/osc/osc';
import { TableModel } from '../src/xair/tableModel';
import { buildMeters } from '../src/xair/XAirClient';
import { NodeUdpTransport } from './nodeTransport';
import { Remote } from '../src/xair/transport';

export interface SimOptions {
  port?: number;
  name?: string;
  wiggle?: boolean;
  log?: boolean;
}

export async function startSimulator(opts: SimOptions = {}) {
  const port = opts.port ?? 10024;
  const name = opts.name ?? 'XR16-SIMU';
  const model = new TableModel(true);
  const state = model.state;

  // Abonnés /xremote : adresse -> heure de fin d'abonnement.
  const subs = new Map<string, { r: Remote; until: number }>();
  const key = (r: Remote) => r.address + ':' + r.port;

  const t = new NodeUdpTransport(port);
  const reply = (r: Remote, path: string, args: OscArg[]) => t.send(encode(path, args), r.address, r.port);
  const broadcast = (path: string, arg: OscArg, except?: Remote) => {
    const now = Date.now();
    for (const [k, sub] of subs) {
      if (sub.until < now) subs.delete(k);
      else if (!except || k !== key(except)) reply(sub.r, path, [arg]);
    }
  };

  await t.open((bytes, from) => {
    const m = decode(bytes);
    if (!m) return;
    if (opts.log) console.log('←', from.address, m.address, m.args.join(' '));
    if (m.address === '/xinfo') {
      reply(from, '/xinfo', [s('127.0.0.1'), s(name), s('XR16'), s('1.17-simu')]);
      return;
    }
    if (m.address === '/meters' && m.args[0] === '/meters/1') {
      meterSubs.set(key(from), { r: from, until: Date.now() + 10000 });
      return;
    }
    if (m.address === '/xremote') {
      subs.set(key(from), { r: from, until: Date.now() + 10000 });
      return;
    }
    if (m.args.length === 0) {
      const cur = model.get(m.address);
      if (cur) reply(from, m.address, [cur]); // adresse inconnue : la vraie table ne répond pas non plus
      return;
    }
    const next = model.set(m.address, m.args[0]);
    if (!next) return;
    // Comme la vraie table : prévient les AUTRES clients abonnés.
    broadcast(m.address, next, from);
  });

  // Vumètres : envoyés toutes les 50 ms aux abonnés
  const meterSubs = new Map<string, { r: Remote; until: number }>();
  let tick = 0;
  const meterTimer = setInterval(() => {
    tick++;
    if (!meterSubs.size) return;
    const blob = buildMeters(model.meters(tick));
    const now = Date.now();
    for (const [k, sub] of meterSubs) {
      if (sub.until < now) meterSubs.delete(k);
      else t.send(encode('/meters/1', [{ t: 'b', v: blob }]), sub.r.address, sub.r.port);
    }
  }, 50);

  let wiggleTimer: ReturnType<typeof setInterval> | null = null;
  if (opts.wiggle) {
    let phase = 0;
    wiggleTimer = setInterval(() => {
      phase += 0.15;
      const v = f(0.55 + 0.25 * Math.sin(phase));
      state.set('/ch/01/mix/fader', v);
      broadcast('/ch/01/mix/fader', v);
    }, 100);
  }

  return {
    port,
    state,
    /** Simule un réglage fait depuis une autre appli. */
    externalSet(path: string, arg: OscArg) {
      state.set(path, arg);
      broadcast(path, arg);
    },
    stop() {
      clearInterval(meterTimer);
      if (wiggleTimer) clearInterval(wiggleTimer);
      t.close();
    },
  };
}

// Lancement direct en ligne de commande.
const isMain = typeof require !== 'undefined' ? require.main === module : process.argv[1]?.includes('xr16-sim');
if (isMain) {
  const wiggle = process.argv.includes('--bouge');
  startSimulator({ wiggle, log: process.argv.includes('--log') }).then((sim) => {
    console.log(`Simulateur XR16 prêt sur le port ${sim.port}${wiggle ? ' (la voie 1 bouge toute seule)' : ''}.`);
    console.log("Dans l'appli, connecte-toi à l'adresse IP de ce Mac.");
  });
}
