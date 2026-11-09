// Diagnostic : lit dans la table tout ce que l'appli suppose (numéros d'effets,
// plages du coupe-bas / gate / compresseur, réseau, vumètres) et fabrique un
// rapport texte à envoyer pour vérification.

import { OscValue } from '../osc/osc';
import { fToCompDb, fToEqGain, fToGainDb, fToGateDb, fToHpfHz, fToHz, fToPan, fToQ } from '../xair/addresses';
import { faderToDb } from '../xair/levels';
import { XAirClient } from '../xair/XAirClient';
import { isPersistent } from '../store/persist';
import { getEntries, stamp, traffic } from './log';

const MON_PATHS = ['/bus/1/dyn/on', '/bus/1/dyn/thr', '/bus/1/dyn/ratio', '/bus/1/dyn/attack', '/bus/1/dyn/release', '/bus/1/dyn/mode', '/rtn/aux/mix/01/level', '/rtn/aux/config/name', '/rtn/1/mix/01/level', '/rtn/1/config/name', '/config/chlink/1-2', '/config/chlink/3-4'];

export const APP_VERSION = '0.7.0-balance-auto';

/** Noms supposés des effets X Air, dans l'ordre de la documentation (à confirmer). */
export const FX_NAMES = [
  'Hall Reverb', 'Ambience', 'Rich Plate', 'Room', 'Chamber', 'Plate', 'Vintage Reverb', 'Vintage Room', 'Gated Reverb',
  'Reverse Reverb', 'Stereo Delay', '3-Tap Delay', 'Rhythm Delay', 'Stereo Chorus', 'Stereo Flanger', 'Stereo Phaser',
  'Dimensional Chorus', 'Mood Filter', 'Rotary Speaker', 'Stereo Tremolo', 'Sub Octaver', 'Delay + Chamber',
  'Chorus + Chamber', 'Flanger + Chamber', 'Delay + Chorus', 'Delay + Flanger', 'Modulation Delay',
];

const fmt = (v: OscValue | undefined) =>
  v === undefined ? '— (pas de réponse)' : typeof v === 'number' ? String(+v.toFixed(5)) : v instanceof Uint8Array ? `blob(${v.length})` : JSON.stringify(v);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runDiagnostic(client: XAirClient, platform: string, onStep?: (s: string) => void, meterWaitMs = 2000): Promise<string> {
  const L: string[] = [];
  const line = (s = '') => L.push(s);
  const get = (p: string) => client.get(p);

  onStep?.('Lecture de la table…');
  const paths: string[] = ['/-prefs/is/ssid', '/-prefs/is/security', '/-prefs/is/mode', '/-prefs/lan/mode', '/-prefs/ap/ssid', '/-prefs/ap/channel', '/-prefs/name'];
  for (let k = 1; k <= 4; k++) {
    paths.push(`/fx/${k}/type`, `/fx/${k}/insert`, `/rtn/${k}/mix/fader`, `/fxsend/${k}/mix/fader`, `/dca/${k}/config/name`, `/dca/${k}/fader`);
    for (let p = 1; p <= 12; p++) paths.push(`/fx/${k}/par/${String(p).padStart(2, '0')}`);
  }
  for (let b = 1; b <= 6; b++) paths.push(`/bus/${b}/config/name`, `/bus/${b}/mix/fader`, `/bus/${b}/mix/on`);
  // Mode « Mon retour » : limiteur du bus 1, envois Aux / effets vers le bus 1, voies liées
  paths.push(...MON_PATHS);
  for (let h = 1; h <= 16; h++) paths.push(`/headamp/${String(h).padStart(2, '0')}/gain`, `/headamp/${String(h).padStart(2, '0')}/phantom`);
  const c1 = ['/ch/01/preamp/hpf', '/ch/01/preamp/hpon', '/ch/01/preamp/invert', '/ch/01/gate/on', '/ch/01/gate/thr', '/ch/01/gate/mode',
    '/ch/01/dyn/on', '/ch/01/dyn/thr', '/ch/01/dyn/ratio', '/ch/01/dyn/mode', '/ch/01/eq/on', '/ch/01/mix/pan', '/ch/01/config/color', '/ch/01/grp/dca'];
  for (let b = 1; b <= 4; b++) c1.push(`/ch/01/eq/${b}/type`, `/ch/01/eq/${b}/f`, `/ch/01/eq/${b}/g`, `/ch/01/eq/${b}/q`);
  paths.push(...c1);
  await client.loadPaths(paths, false);
  await sleep(300);

  onStep?.('Mesure des vumètres…');
  const frames0 = traffic.meterFrames;
  client.startMeters();
  await sleep(meterWaitMs);
  const frames = traffic.meterFrames - frames0;

  line('=== RAPPORT MA TABLE ===');
  line(`Date : ${new Date().toISOString()} · Appli ${APP_VERSION}`);
  line(`Téléphone : ${platform} · sauvegarde ${isPersistent() ? 'active' : 'en mémoire seulement'}`);
  line();
  line('--- Table ---');
  line(`Adresse : ${client.hostAddress} · état : ${client.status} · silence : ${client.silenceSeconds()} s · reconnexions : ${client.reconnections}`);
  line(client.info ? `xinfo : ${client.info.name} | ${client.info.model} | ${client.info.firmware} | ${client.info.ip}` : 'xinfo : aucun');
  line(`Nom console (/-prefs/name) : ${fmt(get('/-prefs/name'))}`);
  line();
  line('--- Réseau ---');
  line(`Client Wi-Fi : ssid=${fmt(get('/-prefs/is/ssid'))} sécurité=${fmt(get('/-prefs/is/security'))} mode=${fmt(get('/-prefs/is/mode'))}`);
  line(`LAN mode=${fmt(get('/-prefs/lan/mode'))} · Point d'accès ssid=${fmt(get('/-prefs/ap/ssid'))} canal=${fmt(get('/-prefs/ap/channel'))}`);
  line();
  line('--- Effets (à comparer avec Mixing Station) ---');
  for (let k = 1; k <= 4; k++) {
    const t = get(`/fx/${k}/type`);
    const guess = typeof t === 'number' ? FX_NAMES[t] ?? '?' : '?';
    line(`FX${k} type=${fmt(t)} (nom supposé : ${guess}) insert=${fmt(get(`/fx/${k}/insert`))} retour=${fmt(get(`/rtn/${k}/mix/fader`))} envoi=${fmt(get(`/fxsend/${k}/mix/fader`))}`);
    const pars = Array.from({ length: 12 }, (_, p) => fmt(get(`/fx/${k}/par/${String(p + 1).padStart(2, '0')}`))).join(' | ');
    line(`   par 01-12 : ${pars}`);
  }
  line();
  line('--- Voie 1 : valeurs brutes et ce que l’appli affiche ---');
  const n = (p: string) => (typeof get(p) === 'number' ? (get(p) as number) : NaN);
  line(`Coupe-bas  brut=${fmt(get('/ch/01/preamp/hpf'))} → appli ${Math.round(fToHpfHz(n('/ch/01/preamp/hpf')))} Hz · actif=${fmt(get('/ch/01/preamp/hpon'))}`);
  line(`Gate       brut=${fmt(get('/ch/01/gate/thr'))} → appli ${fToGateDb(n('/ch/01/gate/thr')).toFixed(1)} dB · actif=${fmt(get('/ch/01/gate/on'))} mode=${fmt(get('/ch/01/gate/mode'))}`);
  line(`Compresseur brut=${fmt(get('/ch/01/dyn/thr'))} → appli ${fToCompDb(n('/ch/01/dyn/thr')).toFixed(1)} dB · ratio=${fmt(get('/ch/01/dyn/ratio'))} actif=${fmt(get('/ch/01/dyn/on'))}`);
  for (let b = 1; b <= 4; b++) {
    const f = n(`/ch/01/eq/${b}/f`), g = n(`/ch/01/eq/${b}/g`), q = n(`/ch/01/eq/${b}/q`);
    line(`EQ bande ${b} type=${fmt(get(`/ch/01/eq/${b}/type`))} f=${fmt(get(`/ch/01/eq/${b}/f`))}→${Math.round(fToHz(f))} Hz g=${fmt(get(`/ch/01/eq/${b}/g`))}→${fToEqGain(g).toFixed(1)} dB q=${fmt(get(`/ch/01/eq/${b}/q`))}→${fToQ(q).toFixed(2)}`);
  }
  line(`Pan brut=${fmt(get('/ch/01/mix/pan'))} → ${fToPan(n('/ch/01/mix/pan')).toFixed(0)} · couleur=${fmt(get('/ch/01/config/color'))} · groupes=${fmt(get('/ch/01/grp/dca'))}`);
  line();
  line('--- Préamplis (gain → dB, 48 V) ---');
  for (let h = 1; h <= 16; h++) {
    const id = String(h).padStart(2, '0');
    const g = get(`/headamp/${id}/gain`);
    line(`IN ${id} : ${g === undefined ? 'pas de préampli (pas de réponse)' : `${fmt(g)} → ${fToGainDb(g as number).toFixed(1)} dB · 48V=${fmt(get(`/headamp/${id}/phantom`))}`}`);
  }
  line();
  line('--- Retours et groupes ---');
  for (let b = 1; b <= 6; b++) line(`Bus ${b} « ${fmt(get(`/bus/${b}/config/name`))} » fader=${fmt(get(`/bus/${b}/mix/fader`))} on=${fmt(get(`/bus/${b}/mix/on`))}`);
  for (let k = 1; k <= 4; k++) {
    const fd = get(`/dca/${k}/fader`);
    line(`Groupe ${k} « ${fmt(get(`/dca/${k}/config/name`))} » fader=${fmt(fd)}${typeof fd === 'number' ? ` (${faderToDb(fd).toFixed(1)} dB)` : ''}`);
  }
  line(`Mon retour (bus 1) : ${MON_PATHS.map((p) => `${p}=${fmt(get(p))}`).join(' · ')}`);
  line();
  line('--- Vumètres ---');
  line(`${frames} blocs reçus en 2 s (attendu ≈ 40) · premier bloc : ${traffic.firstMeterHex || 'aucun'}`);
  line(`Valeurs lues (dB) : ${Array.from(client.meters).map((v) => v.toFixed(1)).join(' ')}`);
  line();
  line('--- Trafic (nombre de messages) ---');
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([a, c]) => `${a}×${c}`).join(', ');
  line(`Envoyés : ${top(traffic.out)}`);
  line(`Reçus : ${top(traffic.in)}`);
  const silent = paths.filter((p) => get(p) === undefined);
  line(`Adresses sans réponse (${silent.length}) : ${silent.join(', ')}`);
  line();
  line('--- Journal (200 dernières lignes) ---');
  for (const e of getEntries().slice(-200)) line(`${stamp(e.t)} [${e.level}] ${e.msg}`);
  line('=== FIN ===');
  onStep?.('Terminé');
  return L.join('\n');
}
