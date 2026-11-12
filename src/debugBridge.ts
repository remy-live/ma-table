// Fichier de démo HTML : la petite barre de débogage (hors de l'appli, voir
// apercu.js) envoie des ordres par postMessage. Seulement en démo, seulement
// sur le web : sur téléphone ce fichier ne fait rien.
import { f, i } from './osc/osc';
import { setModel } from './xair/addresses';
import { setDemoModel, setDemoOffline } from './xair/demoTransport';
import { save } from './store/persist';
import { XAirClient } from './xair/XAirClient';

type Cmd = { mt: 'debug'; model?: string; larsen?: boolean; offline?: boolean; solo?: boolean };

export function installDebugBridge(getClient: () => XAirClient | null) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const tell = () => {
    const c = getClient();
    const st = { mt: 'debug-state', model: c?.info?.model ?? null, demo: c?.hostAddress === 'demo' };
    try { window.parent?.postMessage(st, '*'); } catch { /* rien */ }
  };
  const onMsg = (ev: MessageEvent) => {
    const d = ev.data as Cmd;
    if (!d || d.mt !== 'debug') return;
    const c = getClient();
    if (d.model) {
      setDemoModel(d.model);
      save('demoModele', d.model);
      if (c && c.hostAddress === 'demo') { if (c.info) c.info.model = d.model; setModel(d.model); }
    }
    if (d.offline !== undefined) setDemoOffline(d.offline);
    if (c && c.hostAddress === 'demo') {
      // larsen simulé : un retour poussé à fond se met à siffler (voir tableModel)
      if (d.larsen !== undefined) c.set('/bus/1/mix/fader', f(d.larsen ? 0.95 : 0.6));
      if (d.solo !== undefined) c.set('/-stat/solosw/01', i(d.solo ? 1 : 0));
    }
    tell();
  };
  window.addEventListener('message', onMsg);
  const t = setInterval(tell, 1500);
  return () => { window.removeEventListener('message', onMsg); clearInterval(t); };
}
