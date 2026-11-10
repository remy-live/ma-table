import React, { useEffect, useState } from 'react';
import { AppState, Alert, Linking, StatusBar, View } from 'react-native';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { MixerScreen } from './src/screens/MixerScreen';
import { StageScreen } from './src/screens/StageScreen';
import { MonitorScreen } from './src/screens/MonitorScreen';
import { MonConfig, parseInvite } from './src/xair/monitor';
import { save } from './src/store/persist';
import { setImmersive, useBottomInset } from './src/ui/immersive';
import { TipHost } from './src/ui/tip';
import { safetyBackup, startPeriodicBackup } from './src/store/sessions';
import { journal } from './src/store/journal';
import { keepAwake } from './src/ui/keepAwake';
import { initStorage } from './src/store/persist';
import { THEMES } from './src/ui/theme';
import { Prefs, SettingsScreen } from './src/screens/SettingsScreen';
import { WiringScreen } from './src/screens/WiringScreen';
import { EffectsHub } from './src/screens/EffectsHub';
import { HelpSheet } from './src/screens/HelpSheet';
import { NavBar, Section } from './src/ui/NavBar';
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
      Alert.alert('Verrouillé', 'Déverrouille d’abord depuis l’écran Concert.');
      return;
    }
    setTab(t);
  };

  if (!client) {
    return (
      <>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <ConnectScreen
          theme={theme}
          invite={invite}
          onConnected={(c, mon) => {
            if (mon) {
              setInvite(null);
              setMonitor({ cfg: mon, owner: false });
            } else {
              // photo de sécurité de la table, sans bloquer l'écran
              setTimeout(() => safetyBackup(c, 'connexion').then((sn) => sn && dbg.info('Sauvegarde automatique faite')).catch(() => {}), 1500);
            }
            setClient(c);
          }}
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
          onExit={() => {
            if (!monitor.owner) {
              save('monRetour', null);
              client.close();
              setClient(null);
            }
            setMonitor(null);
          }}
        />
      </>
    );
  }

  const disconnect = () => {
    client.close();
    setClient(null);
    setTab('table');
  };
  const body = (
    <View style={{ flex: 1, paddingBottom: wide ? 8 : 0 }}>
      {tab === 'table' && <MixerScreen client={client} theme={theme} stripWidth={prefs.width} onOpenEffects={(c) => { setFxCh(c); setTab('effets'); }} />}
      {tab === 'effets' && <EffectsHub client={client} theme={theme} focusCh={fxCh} />}
      {tab === 'branchements' && <WiringScreen client={client} theme={theme} visible embedded onClose={() => setTab('table')} />}
      {tab === 'scene' && <StageScreen client={client} theme={theme} locked={locked} onToggleLock={() => setLocked((l) => !l)} onMonitor={(cfg) => setMonitor({ cfg, owner: true })} />}
      {tab === 'reglages' && <SettingsScreen client={client} theme={theme} prefs={prefs} onPrefs={setPrefs} onDisconnect={disconnect} />}
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, flexDirection: wide ? 'row' : 'column', paddingBottom: bottomInset }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      {wide && <NavBar theme={theme} current={tab} locked={locked} vertical onGo={go} onHelp={() => setHelp(true)} onQuit={disconnect} />}
      {body}
      {!wide && <NavBar theme={theme} current={tab} locked={locked} onGo={go} onHelp={() => setHelp(true)} onQuit={disconnect} />}
      <HelpSheet client={client} theme={theme} visible={help} onClose={() => setHelp(false)} />
      <TipHost theme={theme} />
    </View>
  );
}

