import React, { useEffect, useState } from 'react';
import { onModelChange } from './src/xair/addresses';

// navigateur : les textes des dessins SVG prendraient la police à empattements
// par défaut (Times) ; on leur donne la même police que le reste de l'appli.
if (typeof document !== 'undefined' && !document.getElementById('mt-svg-font')) {
  const st = document.createElement('style');
  st.id = 'mt-svg-font';
  st.textContent = 'svg text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}';
  document.head.appendChild(st);
}
import { AppState, Alert, Linking, Pressable, StatusBar, Text, View } from 'react-native';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { MixerScreen } from './src/screens/MixerScreen';
import { StageScreen } from './src/screens/StageScreen';
import { MonitorScreen } from './src/screens/MonitorScreen';
import { MonConfig, parseInvite } from './src/xair/monitor';
import { save } from './src/store/persist';
import { setImmersive, useBottomInset } from './src/ui/immersive';
import { TipHost } from './src/ui/tip';
import { AlertHost } from './src/ui/AlertHost';
import { recordClips } from './src/xair/clip';
import { loadPrepared, markSent, savePrepared, sendPrepared } from './src/store/prepare';
import { WhoAmIScreen } from './src/screens/WhoAmIScreen';
import { Tutorial } from './src/screens/Tutorial';
import { FirstRun } from './src/screens/FirstRun';
import { LarsenWatch } from './src/screens/LarsenWatch';
import { LinkBanner } from './src/ui/LinkBanner';
import { blankTable, safetyBackup, startPeriodicBackup } from './src/store/sessions';
import { journal } from './src/store/journal';
import { keepAwake } from './src/ui/keepAwake';
import { initStorage } from './src/store/persist';
import { THEMES } from './src/ui/theme';
import { Prefs, SettingsScreen } from './src/screens/SettingsScreen';
import { WiringScreen } from './src/screens/WiringScreen';
import { EffectsHub } from './src/screens/EffectsHub';
import { HelpSheet } from './src/screens/HelpSheet';
import { NavBar, Section } from './src/ui/NavBar';
import { SessionsScreen } from './src/screens/SessionsScreen';
import { load } from './src/store/persist';
import { setHaptics } from './src/ui/haptics';
import { useWindowDimensions } from 'react-native';
import { XAirClient } from './src/xair/XAirClient';
import * as dbg from './src/debug/log';
import { APP_VERSION } from './src/debug/diagnostic';


export default function App() {
  const [client, setClient] = useState<XAirClient | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>({ theme: 'nuit', haptics: true, width: 'normal', immersive: true });
  const themeKey = prefs.theme;
  const [tab, setTab] = useState<Section>('table');
  const bottomInset = useBottomInset(prefs.immersive !== false, prefs.navRoom);
  const [fxCh, setFxCh] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [mixes, setMixes] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    setHaptics(p.haptics);
    setImmersive(p.immersive !== false);
    save('prefs', p);
  };
  const [locked, setLocked] = useState(false);
  const [monitor, setMonitor] = useState<{ cfg: MonConfig; owner: boolean } | null>(null);
  const [invite, setInvite] = useState<MonConfig | null>(null);
  const [prep, setPrep] = useState(false);
  const [tuto, setTuto] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  // le musicien dit qui il est (choisit ou nomme son retour)
  const [who, setWho] = useState<{ host: string; current: MonConfig | null } | null>(null);
  const theme = THEMES[themeKey] ?? THEMES.nuit;

  useEffect(() => {
    initStorage().then(async (ok) => {
      dbg.info(`Appli ${APP_VERSION} démarrée · sauvegarde ${ok ? 'active' : 'en mémoire'}`);
      const p = await load<Prefs | null>('prefs', null);
      const merged: Prefs = Object.assign({ theme: 'nuit', haptics: true, width: 'normal' as const, immersive: true }, p ?? {});
      setPrefsState(merged);
      setHaptics(merged.haptics !== false);
      setImmersive(merged.immersive !== false);
    });
    // Toute erreur JavaScript finit dans le journal de débogage.
    const EU = (global as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
    if (EU) {
      const prev = EU.getGlobalHandler();
      EU.setGlobalHandler((e, fatal) => {
        dbg.error(`${fatal ? 'ERREUR FATALE' : 'Erreur'} : ${e instanceof Error ? e.message + '\n' + (e.stack ?? '').split('\n').slice(0, 4).join('\n') : String(e)}`);
        prev(e, fatal);
      });
    }
  }, []);

  // Écran allumé tant qu'une table est connectée, et photo de sécurité toutes les 10 min
  useEffect(() => {
    keepAwake(!!client);
    const stop = client ? startPeriodicBackup(client, undefined, (a) => a && dbg.info('Sauvegarde automatique (10 min)')) : null;
    if (client) journal.start(client);
    return () => {
      keepAwake(false);
      stop?.();
      journal.stop();
    };
  }, [client]);

  // QR code scanné avec l'appareil photo → l'appli s'ouvre sur matable://retour?…
  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      const cfg = url ? parseInvite(url) : null;
      if (!cfg) return;
      dbg.info(`Invitation reçue : retour ${cfg.bus} sur ${cfg.host}`);
      setInvite({ ...cfg });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  // Invitation reçue alors qu'on pilote déjà la table : on demande.
  // les gestes en 30 s : une fois, au premier lancement
  // premier lancement : le démarrage guidé en 3 étapes (les gestes restent dans Aide-moi)
  useEffect(() => { if (client && !prep) load<boolean>('demarrageVu', false).then((v) => { if (!v) setFirstRun(true); }); }, [client, prep]);
  // historique des saturations de la soirée, tenu tant qu'on est connecté
  useEffect(() => {
    if (!client) return;
    client.startMeters();
    const off = client.onMeters((m) => recordClips(m, Date.now()));
    return () => { off(); client.stopMeters(); };
  }, [client]);
  useEffect(() => {
    if (!invite || !client) return;
    const cfg = invite;
    setInvite(null);
    Alert.alert('Invitation reçue', `Passer en mode « Mon retour » (${cfg.name}, AUX ${cfg.bus}) ?`, [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui', onPress: () => setMonitor({ cfg, owner: true }) },
    ]);
  }, [invite, client]);

  useEffect(() => {
    if (prefs.immersive === false) return;
    const timers = [600, 2000, 5000].map((ms) => setTimeout(() => setImmersive(true), ms));
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') setTimeout(() => setImmersive(true), 300); });
    return () => { timers.forEach(clearTimeout); sub.remove(); };
  }, [prefs.immersive]);
  useEffect(() => { if (prefs.immersive !== false) setImmersive(true); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (t: Section) => {
    if (locked && t !== 'scene') {
      Alert.alert('🔒 Verrouillé pour le concert', 'Pour ouvrir : dans Concert, reste appuyé sur « Verrouillé » une seconde.');
      return;
    }
    setTab(t);
  };

  const [navHidden, setNavHidden] = useState(false);
  // démo : changer de table redessine les écrans, sans revenir au début
  const [modelTick, setModelTick] = useState(0);
  useEffect(() => onModelChange(() => setModelTick((t) => t + 1)), []);
  if (!client) {
    return (
      <>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <ConnectScreen
          theme={theme}
          invite={invite}
          onConnected={(c, mon, musician, prepMode) => {
            setPrep(!!prepMode);
            if (prepMode) {
              // on part de ce qui a déjà été préparé, sinon d'une table vide
              loadPrepared().then((p) => { if (p) sendPrepared(c, p); else return blankTable(c); }).catch(() => {});
            } else if (musician) {
              setWho({ host: c.hostAddress, current: null });
            } else if (mon) {
              setInvite(null);
              setMonitor({ cfg: mon, owner: false });
            } else {
              // photo de sécurité de la table, sans bloquer l'écran
              setTimeout(() => safetyBackup(c, 'connexion').then((sn) => sn && dbg.info('Sauvegarde automatique faite')).catch(() => {}), 1500);
              // une préparation faite chez soi attend d'être envoyée ?
              if (c.hostAddress !== 'demo') setTimeout(() => loadPrepared().then((p) => {
                if (!p || (p.sent && p.sent > p.savedAt)) return;
                Alert.alert('Ta préparation', `Tu as préparé ta soirée chez toi (${new Date(p.savedAt).toLocaleDateString('fr-FR')}). L’envoyer à la table ? Les gains et le 48 V ne changent pas.`, [
                  { text: 'Plus tard', style: 'cancel' },
                  { text: 'Envoyer', onPress: () => { safetyBackup(c, 'avant préparation').catch(() => {}).finally(() => { sendPrepared(c, p); markSent(); }); } },
                ]);
              }), 2500);
            }
            if (c.hostAddress === 'demo') (globalThis as unknown as { __demoClient?: XAirClient }).__demoClient = c; // essais du fichier de démo
            setClient(c);
          }}
        />
      </>
    );
  }

  if (who && client) {
    return (
      <>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <WhoAmIScreen
          client={client}
          theme={theme}
          host={who.host}
          current={who.current}
          onDone={(cfg) => { if (cfg.host && cfg.host !== 'demo') save('monRetour', cfg); setWho(null); setMonitor({ cfg, owner: monitor?.owner ?? false }); }}
          onCancel={() => { setWho(null); if (!monitor) { client.close(); setClient(null); } }}
        />
      </>
    );
  }

  if (monitor) {
    return (
      <>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <MonitorScreen
          client={client}
          cfg={monitor.cfg}
          theme={theme}
          owner={monitor.owner}
          onWho={() => setWho({ host: monitor.cfg.host, current: monitor.cfg })}
          onExit={() => {
            if (!monitor.owner) {
              save('monRetour', null);
              client.close();
              setClient(null);
            }
            setMonitor(null);
          }}
        />
        <LinkBanner client={client} top={40} />
      </>
    );
  }

  // Nuit rouge : on retient le design d'avant pour y revenir d'un geste
  const toggleNight = () => {
    if (themeKey === 'rouge') setPrefs({ ...prefs, theme: prefs.dayTheme && prefs.dayTheme !== 'rouge' ? prefs.dayTheme : 'nuit' });
    else setPrefs({ ...prefs, theme: 'rouge', dayTheme: themeKey });
  };
  const disconnect = () => {
    client.close();
    setClient(null);
    setTab('table');
  };
  const body = (
    <View key={modelTick} style={{ flex: 1, paddingBottom: wide ? 8 : 0 }}>
      {tab === 'table' && <MixerScreen client={client} theme={theme} stripWidth={prefs.width} onOpenEffects={(c) => { setFxCh(c); setTab('effets'); }} />}
      {tab === 'effets' && <EffectsHub client={client} theme={theme} focusCh={fxCh} />}
      {tab === 'branchements' && <WiringScreen client={client} theme={theme} visible embedded onClose={() => setTab('table')} onFull={setNavHidden} />}
      {tab === 'scene' && <StageScreen client={client} theme={theme} locked={locked} onToggleLock={() => setLocked((l) => !l)} onMonitor={(cfg) => setMonitor({ cfg, owner: true })} night={themeKey === 'rouge'} onNight={toggleNight} />}
      {tab === 'reglages' && <SettingsScreen client={client} theme={theme} prefs={prefs} onPrefs={setPrefs} onDisconnect={disconnect} />}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, flexDirection: wide ? 'row' : 'column', paddingBottom: bottomInset }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      {wide && !(navHidden && tab === 'branchements') && <NavBar client={client} theme={theme} current={tab} locked={locked} vertical onGo={go} onHelp={() => setHelp(true)} onQuit={disconnect} onMixes={() => setMixes(true)} />}
      {body}
      {!wide && !(navHidden && tab === 'branchements') && <NavBar client={client} theme={theme} current={tab} locked={locked} onGo={go} onHelp={() => setHelp(true)} onQuit={disconnect} />}
      <HelpSheet client={client} theme={theme} visible={help} onClose={() => setHelp(false)} onSeeWiring={() => go('branchements')} />
      {mixes && <SessionsScreen client={client} theme={theme} visible={mixes} onClose={() => setMixes(false)} />}
      {prep && <PrepBar client={client} theme={theme} bottom={bottomInset} onDone={() => { setPrep(false); client.close(); setClient(null); }} />}
      <Tutorial theme={theme} visible={tuto} onClose={() => { setTuto(false); save('tutoVu', true); }} />
      <FirstRun client={client} theme={theme} visible={firstRun} onClose={() => { setFirstRun(false); save('demarrageVu', true); }} onGestures={() => setTuto(true)} onTryHere={(cfg) => setMonitor({ cfg, owner: true })} />
      <LarsenWatch client={client} theme={theme} />
      <LinkBanner client={client} top={wide ? 64 : 110} />
      {themeKey === 'rouge' && <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(25,0,0,0.35)' }} />}
      <TipHost theme={theme} />
      <AlertHost theme={theme} />
    </View>
  );
}


/** Bandeau du mode « Préparer chez moi » : tout reste gardé dans l'appli, on termine quand on veut. */
function PrepBar({ client, theme, bottom, onDone }: { client: XAirClient; theme: (typeof THEMES)[string]; bottom: number; onDone: () => void }) {
  const [msg, setMsg] = useState('');
  const keep = async () => { await savePrepared(client); setMsg('Gardé ✓'); setTimeout(() => setMsg(''), 2000); };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: bottom + 16, flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: theme.panel, borderColor: theme.accent, borderWidth: 2, borderRadius: 18, padding: 8, elevation: 12 }}>
      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13, paddingHorizontal: 6 }}>🏠 Préparation sans table{msg ? ` · ${msg}` : ''}</Text>
      <Pressable onPress={keep} style={{ height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.accent, justifyContent: 'center' }}><Text style={{ color: theme.accent, fontWeight: '800' }}>💾 Garder</Text></Pressable>
      <Pressable onPress={() => { savePrepared(client).finally(onDone); }} style={{ height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: theme.accent, justifyContent: 'center' }}><Text style={{ color: theme.onAccent, fontWeight: '900' }}>Terminer</Text></Pressable>
    </View>
  );
}
