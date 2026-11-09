import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
import { MixerScreen } from './src/screens/MixerScreen';
import { StageScreen } from './src/screens/StageScreen';
import { MonitorScreen } from './src/screens/MonitorScreen';
import { MonConfig, parseInvite } from './src/xair/monitor';
import { save } from './src/store/persist';
import { safetyBackup, startPeriodicBackup } from './src/store/sessions';
import { journal } from './src/store/journal';
import { keepAwake } from './src/ui/keepAwake';
import { initStorage } from './src/store/persist';
import { THEME_ORDER, THEMES } from './src/ui/theme';
import { XAirClient } from './src/xair/XAirClient';
import * as dbg from './src/debug/log';
import { APP_VERSION } from './src/debug/diagnostic';

type Tab = 'table' | 'scene' | 'connexion';

export default function App() {
  const [client, setClient] = useState<XAirClient | null>(null);
  const [themeKey, setThemeKey] = useState('nuit');
  const [tab, setTab] = useState<Tab>('table');
  const [locked, setLocked] = useState(false);
  const [monitor, setMonitor] = useState<{ cfg: MonConfig; owner: boolean } | null>(null);
  const [invite, setInvite] = useState<MonConfig | null>(null);
  const theme = THEMES[themeKey];

  useEffect(() => {
    initStorage().then((ok) => dbg.info(`Appli ${APP_VERSION} démarrée · sauvegarde ${ok ? 'active' : 'en mémoire'}`));
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

  const go = (t: Tab) => {
    if (locked && t !== 'scene') {
      Alert.alert('Verrouillé', 'Déverrouille d’abord depuis l’écran Scène.');
      return;
    }
    setTab(t);
  };

  if (!client) {
    return (
      <>
        <StatusBar barStyle={themeKey === 'jour' ? 'dark-content' : 'light-content'} />
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
        <StatusBar barStyle={themeKey === 'jour' ? 'dark-content' : 'light-content'} />
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={themeKey === 'jour' ? 'dark-content' : 'light-content'} />
      <View style={{ flex: 1 }}>
        {tab === 'table' && (
          <MixerScreen client={client} theme={theme} onNextTheme={() => setThemeKey(THEME_ORDER[(THEME_ORDER.indexOf(themeKey) + 1) % THEME_ORDER.length])} />
        )}
        {tab === 'scene' && <StageScreen client={client} theme={theme} locked={locked} onToggleLock={() => setLocked((l) => !l)} onMonitor={(cfg) => setMonitor({ cfg, owner: true })} />}
        {tab === 'connexion' && (
          <ConnectionScreen
            client={client}
            theme={theme}
            onDisconnect={() => {
              client.close();
              setClient(null);
              setTab('table');
            }}
          />
        )}
      </View>
      <View style={[styles.tabs, { backgroundColor: theme.deep, borderTopColor: theme.line }]}>
        {(
          [
            ['table', 'Table'],
            ['scene', 'Scène'],
            ['connexion', 'Connexion'],
          ] as [Tab, string][]
        ).map(([id, label]) => {
          const on = tab === id;
          const dim = locked && id !== 'scene';
          return (
            <Pressable key={id} onPress={() => go(id)} accessibilityRole="tab" accessibilityState={{ selected: on, disabled: dim }} style={styles.tab}>
              <View style={[styles.tabPill, on && { backgroundColor: theme.panel }]}>
                <Text style={{ color: on ? theme.accent : dim ? theme.line2 : theme.muted, fontWeight: on ? '800' : '600', fontSize: 13 }}>{label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderTopWidth: 1, paddingBottom: 20, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center' },
  tabPill: { height: 44, minWidth: 96, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
