// Ce que répond la tablette à la page « Mon retour » (sans réseau : testable).
import { f, i } from '../osc/osc';
import { CH_COUNT, chNamePath, chOnPath, gainDbToF, headampGainPath } from '../xair/addresses';
import { dbToFader, faderToDb } from '../xair/levels';
import { busFaderPath, limiterOn, MonConfig, monitorSources, plusDeMoi, plusDesAutres, setLimiter, setTo, shift, sourceDb } from '../xair/monitor';
import { chColor } from '../xair/smartName';
import { plugs } from '../xair/wiring';
import { XAirClient } from '../xair/XAirClient';
import { REMOTE_PAGE } from './remotePage';

const json = (o: unknown) => ({ status: '200 OK', type: 'application/json', body: JSON.stringify(o) });

export function handleRemote(client: XAirClient | null, invites: Map<string, MonConfig>, method: string, url: string): { status: string; type: string; body: string } {
  const [path, qs = ''] = url.split('?');
  const q: Record<string, string> = {};
  for (const kv of qs.split('&')) { if (!kv) continue; const [k, v = ''] = kv.split('='); q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); }
  if (path === '/' || path === '/index.html') return { status: '200 OK', type: 'text/html', body: REMOTE_PAGE };
  if (!path.startsWith('/api/')) return { status: '404 Not Found', type: 'text/plain', body: 'introuvable' };
  const cfg = invites.get(q.k ?? '');
  if (!cfg || !client) return json({ ok: false, msg: 'Invitation inconnue : redemande le QR code au sondier.' });
  if (path === '/api/state') return json(state(client, cfg));
  if (path === '/api/do' && method === 'POST') { act(client, cfg, q); return json(state(client, cfg)); }
  return json({ ok: false, msg: 'Action inconnue' });
}

function sourcesOf(c: XAirClient, cfg: MonConfig) {
  return monitorSources(c, cfg.bus, cfg.rights.fx);
}

function state(c: XAirClient, cfg: MonConfig) {
  const src = sourcesOf(c, cfg);
  const P = plugs(c);
  const gainOf = (ch: number) => {
    const plug = P.find((p) => p.chans.includes(ch))?.n ?? ch;
    return Math.round(Number(c.get(headampGainPath(plug)) ?? 0) * 72 - 12);
  };
  return {
    ok: true,
    name: cfg.name,
    bus: cfg.bus,
    master: Math.max(-90, faderToDb(Number(c.get(busFaderPath(cfg.bus)) ?? 0.75))),
    lim: limiterOn(c, cfg.bus),
    canLim: cfg.rights.limiterOff,
    sources: src.map((s, k) => ({ i: k, label: s.label, db: Math.max(-90, sourceDb(c, s)), me: s.channels.some((ch) => cfg.me.includes(ch)), color: s.channels[0] ? chColor(c, s.channels[0]) : '#A78BFA' })),
    chans: cfg.rights.chans ? cfg.me.filter((ch) => ch >= 1 && ch <= CH_COUNT).map((ch) => ({ ch, name: String(c.get(chNamePath(ch)) ?? '') || `Voie ${ch}`, gain: gainOf(ch), on: Number(c.get(chOnPath(ch)) ?? 1) === 1 })) : [],
  };
}

function act(c: XAirClient, cfg: MonConfig, q: Record<string, string>) {
  const src = sourcesOf(c, cfg);
  const s = src[Number(q.i)];
  const db = Number(q.db);
  switch (q.a) {
    case 'set': if (s && isFinite(db)) setTo(c, s.paths, db <= -40 ? -Infinity : db); break;
    case 'shift': if (s && isFinite(db)) shift(c, s.paths, db, db > 0); break;
    case 'moi': plusDeMoi(c, src, cfg.me); break;
    case 'autres': plusDesAutres(c, src, cfg.me); break;
    case 'master': if (isFinite(db)) c.set(busFaderPath(cfg.bus), f(db <= -40 ? 0 : dbToFader(Math.min(10, db)))); break;
    case 'lim': if (cfg.rights.limiterOff || q.on === '1') setLimiter(c, cfg.bus, q.on === '1'); break;
    case 'gain': {
      const ch = Number(q.ch);
      if (!cfg.rights.chans || !cfg.me.includes(ch) || !isFinite(db)) break;
      const plug = plugs(c).find((p) => p.chans.includes(ch))?.n ?? ch;
      const cur = Number(c.get(headampGainPath(plug)) ?? 0) * 72 - 12;
      c.set(headampGainPath(plug), f(gainDbToF(Math.max(-12, Math.min(60, cur + db)))));
      break;
    }
    case 'mute': {
      const ch = Number(q.ch);
      if (!cfg.rights.chans || !cfg.me.includes(ch)) break;
      c.set(chOnPath(ch), i(Number(c.get(chOnPath(ch)) ?? 1) === 1 ? 0 : 1));
      break;
    }
  }
}

