import React, { useEffect, useState } from 'react';
import { QrScanner } from '../ui/QrScanner';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { WLAN, WLAN_PATHS, XAIR_MODELS } from '../xair/addresses';
import { BUILD_VERSION } from '../version';
import { canScanWifi, currentWifi, openFix, ScanInfo, scanWifi, WifiNet, wifiBars } from '../xair/wifiScan';
import { DEFAULT_RIGHTS, MonConfig, parseInvite, parseShortCode } from '../xair/monitor';
import { TableInfo, XAirClient } from '../xair/XAirClient';
import { RnUdpTransport } from '../xair/udpTransport';
import { DemoTransport, getDemoModel, setDemoModel } from '../xair/demoTransport';
import { HOTSPOT_PREFIXES, sweep } from '../xair/network';
import { load, save } from '../store/persist';
import * as dbg from '../debug/log';
import { DebugScreen } from './DebugScreen';
import { Theme } from '../ui/theme';

// une seule tentative automatique par lancement de l'appli (pas après « Quitter »)
let autoTried = false;

interface MyTable { ip: string; name: string; model: string; at: number; ssid?: string; mode?: number }

export function ConnectScreen({ theme, onConnected, invite }: { theme: Theme; onConnected: (c: XAirClient, mon?: MonConfig, musician?: boolean, prep?: boolean) => void; invite?: MonConfig | null }) {
  const [code, setCode] = useState('');
  const [lastMon, setLastMon] = useState<MonConfig | null>(null);
  const [found, setFound] = useState<TableInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [ip, setIp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [dbgOpen, setDbgOpen] = useState(false);
  const [mine, setMine] = useState<MyTable | null>(null);
  const wide = useWindowDimensions().width >= 900;
  useEffect(() => { load<MyTable | null>('maTable', null).then(setMine); }, []);
  const [nets, setNets] = useState<WifiNet[]>([]);
  const [scanning, setScanning] = useState(false);
  const [onNet, setOnNet] = useState('');
  const [netNote, setNetNote] = useState('');
  const [hiddenN, setHiddenN] = useState(0);
  const [fix, setFix] = useState<ScanInfo['fix']>(undefined);
  const scanNets = async () => {
    if (!canScanWifi) return;
    setScanning(true);
    try { const r = await scanWifi(); setNets(r.nets); setNetNote(r.note); setHiddenN(r.hidden); setFix(r.fix); setOnNet(currentWifi()); } catch (e) { dbg.warn('Scan Wi-Fi : ' + String(e)); }
    setScanning(false);
  };
  useEffect(() => { scanNets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // retour dans l'appli (après avoir allumé la localisation) : on relance la recherche
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && canScanWifi) scanNets(); });
    return () => sub.remove();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Au lancement : on se reconnecte tout seul à la dernière table
  const [auto, setAuto] = useState<{ host: string; name: string } | null>(null);
  const autoCancel = React.useRef(false);
  useEffect(() => {
    load<string | null>('derniereIp', null).then(async (ip0) => {
      setLast(ip0);
      if (autoTried || !ip0 || invite) return;
      autoTried = true;
      const t = await load<MyTable | null>('maTable', null);
      autoCancel.current = false;
      setAuto({ host: ip0, name: t?.ip === ip0 ? t.name : ip0 });
      await connect(ip0, false, undefined, false, false, autoCancel);
      setAuto(null);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Partage de connexion : la diffusion ne passe pas toujours, on interroge chaque adresse. */
  const searchHotspot = async () => {
    setSweeping(true);
    setError('');
    const extra = ip.trim().split('.').length >= 3 ? [ip.trim().split('.').slice(0, 3).join('.')] : [];
    const lastPrefix = last ? [last.split('.').slice(0, 3).join('.')] : [];
    const prefixes = Array.from(new Set([...extra, ...lastPrefix, ...HOTSPOT_PREFIXES]));
    try {
      const res = await sweep(new RnUdpTransport(), prefixes);
      dbg.info(`Balayage ${prefixes.join(', ')} : ${res.length} table(s) ${res.map((r) => r.ip).join(', ')}`);
      setFound((f) => [...f.filter((x) => !res.some((r) => r.ip === x.ip)), ...res]);
      if (!res.length) setError('Aucune table trouvée. Vérifie que l’interrupteur REMOTE est sur WIFI CLIENT et que ton partage est actif.');
    } catch (e) {
      setError('Recherche impossible : ' + String(e));
    }
    setSweeping(false);
  };

  const search = async () => {
    setSearching(true);
    setError('');
    try {
      const res = await XAirClient.discover(new RnUdpTransport());
      dbg.info(`Recherche par diffusion : ${res.length} table(s) ${res.map((r) => r.ip).join(', ')}`);
      setFound(res);
    } catch (e) {
      setError('Recherche impossible : ' + String(e));
    }
    setSearching(false);
  };

  useEffect(() => {
    search();
  }, []);

  useEffect(() => {
    load<MonConfig | null>('monRetour', null).then(setLastMon);
  }, []);
  // Lien d'invitation reçu (QR code scanné avec l'appareil photo)
  useEffect(() => {
    if (invite) connect(invite.host, invite.host === 'demo', invite);
  }, [invite]); // eslint-disable-line react-hooks/exhaustive-deps

  const [qrOpen, setQrOpen] = useState(false);
  const join = () => {
    const full = parseInvite(code);
    const short = full ? null : parseShortCode(code);
    const cfg: MonConfig | null = full ?? (short ? { host: short.host, bus: short.bus, name: `Retour ${short.bus}`, me: [], rights: DEFAULT_RIGHTS } : null);
    if (!cfg) {
      setError('Code non reconnu. Exemple : 172.20.10.2 · 1 (adresse de la table, puis numéro du retour).');
      return;
    }
    connect(cfg.host, false, cfg);
  };

  const [demoM, setDemoM] = useState(getDemoModel());
  useEffect(() => { load<string>('demoModele', 'XR18').then((m) => { setDemoModel(m); setDemoM(m); }); }, []);
  const connect = async (host: string, demo = false, mon?: MonConfig, musician = false, prep = false, cancel?: { current: boolean }) => {
    setBusy(true);
    setError('');
    const client = new XAirClient(demo ? new DemoTransport() : new RnUdpTransport());
    try {
      await client.connect(host);
      if (cancel?.current) { client.close(); setBusy(false); return; }
      if (!demo && !mon && !musician) {
        save('derniereIp', host);
        const inf = client.info;
        const base: MyTable = { ip: host, name: inf?.name || host, model: inf?.model || '', at: Date.now(), ssid: mine?.ssid, mode: mine?.mode };
        save('maTable', base);
        // Wi-Fi de la table (adresses à vérifier) : lu en arrière-plan
        client.loadPaths(WLAN_PATHS).then(() => {
          const mode = Number(client.get(WLAN.mode) ?? NaN);
          const ssid = String((mode === 1 ? client.get(WLAN.isSsid) : client.get(WLAN.apSsid)) ?? '') || base.ssid;
          save('maTable', { ...base, ssid, mode: isFinite(mode) ? mode : undefined });
        }).catch(() => {});
      }
      if (mon && !demo) save('monRetour', mon);
      onConnected(client, mon, musician, prep);
    } catch (e) {
      client.close();
      dbg.error(`Connexion à ${host} impossible : ${String(e)}`);
      if (!cancel?.current) setError(`Pas de réponse de ${host}. Vérifie que le téléphone est sur le Wi-Fi de la table.`);
    }
    setBusy(false);
  };

  const tryNames = Array.from(new Set([mine?.ssid, mine?.name].filter(Boolean))) as string[];
  const openWifi = () => {
    if (Platform.OS === 'android') Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => Linking.openSettings());
    else Linking.openSettings();
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={[styles.root, wide && { paddingHorizontal: 40, flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={[styles.logo, { backgroundColor: theme.accent }]}>
          {[0.5, 0.8, 0.35, 0.65].map((h, k) => <View key={k} style={{ width: 6, height: 34 * h, borderRadius: 3, backgroundColor: theme.onAccent }} />)}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Ma table</Text>
          <Text style={{ color: theme.muted, fontSize: 13 }}>{BUILD_VERSION === 'dev' ? 'version de développement' : `v${BUILD_VERSION}`}</Text>
        </View>
        <Pressable onPress={() => setDbgOpen(true)} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>Débogage</Text></Pressable>
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14 }}>
        <View style={{ flex: 1, gap: 12 }}>
          {/* TA TABLE */}
          {mine && (
            <Pressable onPress={() => connect(mine.ip)} disabled={busy} style={[styles.hero, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
              <Text style={[styles.kicker, { color: theme.accent }]}>TA TABLE</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <MixerIcon color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>{mine.name}</Text>
                  <Text style={{ color: theme.muted, fontSize: 13 }}>{mine.model} · {mine.ip}{mine.ssid ? ` · Wi-Fi « ${mine.ssid} »` : ''}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>dernière fois {ago(mine.at)}</Text>
                </View>
                <View style={[styles.go, { backgroundColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 16 }}>{busy ? '…' : 'Connecter'}</Text></View>
              </View>
            </Pressable>
          )}
          {lastMon && (
            <Pressable onPress={() => connect(lastMon.host, false, lastMon)} style={[styles.card, { borderColor: '#34D399', backgroundColor: '#13261E' }]}>
              <Text style={{ color: '#A7F3D0', fontSize: 16, fontWeight: '800' }}>Reprendre mon retour</Text>
              <Text style={{ color: '#6EE7B7', fontSize: 12 }}>{lastMon.name} · AUX {lastMon.bus} · {lastMon.host}</Text>
            </Pressable>
          )}

          {/* TABLES TROUVÉES */}
          <View style={styles.row}>
            <Text style={[styles.kicker, { color: theme.muted }]}>SUR CE RÉSEAU</Text>
            <Pressable onPress={search} disabled={searching} style={[styles.small, { borderColor: theme.line2 }]}>
              {searching ? <ActivityIndicator color={theme.text} /> : <Text style={{ color: theme.text, fontWeight: '700' }}>↻ Chercher</Text>}
            </Pressable>
          </View>
          {found.length === 0 && !searching && <Text style={{ color: theme.muted }}>Aucune table vue ici pour l’instant.</Text>}
          {searching && found.length === 0 && <Radar color={theme.accent} theme={theme} />}
          {found.map((t) => (
            <Pressable key={t.ip} onPress={() => connect(t.ip)} style={[styles.found, { backgroundColor: theme.panel, borderColor: theme.line2 }]}>
              <MixerIcon color="#34D399" small />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{t.name}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{t.model} · {t.ip} · {t.firmware}</Text>
              </View>
              <Pressable onPress={() => connect(t.ip, false, undefined, true)} style={[styles.small, { borderColor: '#34D399', height: 40 }]} accessibilityLabel="Je suis musicien : régler seulement mon retour">
                <Text style={{ color: '#34D399', fontWeight: '800', fontSize: 12 }}>🎧 Je suis musicien</Text>
              </Pressable>
              <Text style={{ color: theme.accent, fontWeight: '800' }}>Sondier ›</Text>
            </Pressable>
          ))}
          <Pressable onPress={searchHotspot} disabled={sweeping} style={[styles.card, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{sweeping ? 'Recherche adresse par adresse…' : 'Chercher sur mon partage de connexion'}</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Quand la table a rejoint le Wi-Fi de ton téléphone ou d’un routeur.</Text>
          </Pressable>
          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, gap: 8 }]}>
            <Text style={[styles.kicker, { color: theme.muted }]}>PAR ADRESSE IP</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={ip} onChangeText={setIp} placeholder="192.168.1.1" placeholderTextColor={theme.muted} keyboardType="numbers-and-punctuation" autoCapitalize="none" style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
              <Pressable onPress={() => ip && connect(ip.trim())} style={[styles.go, { backgroundColor: theme.accent, opacity: ip ? 1 : 0.5 }]}>
                <Text style={{ color: theme.onAccent, fontWeight: '700', fontSize: 16 }}>Connecter</Text>
              </Pressable>
            </View>
          </View>

        </View>

        <View style={{ flex: 1, gap: 12 }}>
          {wide && <Text style={[styles.kicker, { color: theme.muted }]}>PAS ENCORE RELIÉ ?</Text>}
          {/* WI-FI */}
          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, gap: 10 }]}>
            <View style={styles.row}>
              <Text style={[styles.kicker, { color: theme.muted }]}>{canScanWifi ? 'WI-FI AUTOUR DE TOI' : 'LE BON WI-FI'}</Text>
              {canScanWifi && (
                <Pressable onPress={scanNets} disabled={scanning} style={[styles.small, { borderColor: theme.line2 }]}>
                  {scanning ? <ActivityIndicator color={theme.text} /> : <Text style={{ color: theme.text, fontWeight: '700' }}>↻</Text>}
                </Pressable>
              )}
            </View>
            {!!onNet && <Text style={{ color: theme.muted, fontSize: 12 }}>Tu es connecté à <Text style={{ color: theme.text, fontWeight: '800' }}>{onNet}</Text></Text>}
            {canScanWifi && nets.length > 0 && (
              <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 6 }} nestedScrollEnabled>
                {nets.map((n) => {
                  const mineNet = n.table || n.ssid === mine?.ssid || n.ssid === mine?.name;
                  const here = n.ssid === onNet;
                  return (
                    <Pressable key={n.ssid} onPress={openWifi} style={[styles.net, { borderColor: here ? '#34D399' : mineNet ? theme.accent : theme.line2, backgroundColor: theme.deep, borderWidth: mineNet || here ? 2 : 1 }]}>
                      <Bars n={wifiBars(n.level)} color={mineNet ? theme.accent : theme.muted} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{n.ssid}</Text>
                        <Text style={{ color: theme.muted, fontSize: 11 }}>{n.freq > 4000 ? '5 GHz' : '2,4 GHz'} · {n.level} dBm{mineNet ? ' · c’est une table !' : ''}</Text>
                      </View>
                      {here ? <Text style={{ color: '#34D399', fontWeight: '800', fontSize: 12 }}>✓ connecté</Text> : mineNet ? <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 12 }}>Rejoindre ›</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {canScanWifi && (nets.length > 0 || hiddenN > 0) && <Text style={{ color: theme.muted, fontSize: 11 }}>{nets.length} réseau{nets.length > 1 ? 'x' : ''}{hiddenN ? ` · ${hiddenN} caché${hiddenN > 1 ? 's' : ''} (sans nom)` : ''}</Text>}
            {!!netNote && (
              <View style={[styles.net, { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.10)', flexWrap: 'wrap' }]}>
                <Text style={{ color: '#FCD34D', fontSize: 12, fontWeight: '700', flex: 1, minWidth: 180 }}>{netNote}</Text>
                {fix && (
                  <Pressable onPress={() => openFix(fix)} style={[styles.go, { backgroundColor: theme.accent, height: 40 }]}>
                    <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 13 }}>{fix === 'location' ? 'Activer la localisation ›' : fix === 'wifi' ? 'Allumer le Wi-Fi ›' : 'Autoriser ›'}</Text>
                  </Pressable>
                )}
              </View>
            )}
            {canScanWifi && !scanning && nets.length === 0 && !netNote && <Text style={{ color: theme.muted, fontSize: 12 }}>Aucun réseau vu : autorise la localisation (Android l’exige pour lister le Wi-Fi), puis ↻.</Text>}
            {!canScanWifi && (tryNames.length > 0 ? tryNames.map((n) => (
              <View key={n} style={[styles.net, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                <WifiIcon color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{n}</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>{n === mine?.ssid && mine?.mode === 1 ? 'le réseau que ta table rejoint' : 'le Wi-Fi créé par ta table'}</Text>
                </View>
              </View>
            )) : (
              <View style={[styles.net, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                <WifiIcon color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>XR18-…  /  XR16-…</Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }}>le Wi-Fi de la table porte son nom (l’iPhone ne laisse pas les applis lister le Wi-Fi)</Text>
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Num n={1} c={theme.accent} theme={theme} /><Text style={{ color: theme.muted, fontSize: 12, flex: 1 }}>Ouvre le Wi-Fi du téléphone et choisis ce réseau</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Num n={2} c={theme.accent} theme={theme} /><Text style={{ color: theme.muted, fontSize: 12, flex: 1 }}>Reviens ici : la table apparaît toute seule</Text>
            </View>
            <Pressable onPress={openWifi} style={[styles.go, { backgroundColor: theme.accent, alignItems: 'center' }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Ouvrir le Wi-Fi du téléphone</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flex: 1, gap: 12 }}>

          <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line, gap: 8 }]}>
            <Text style={[styles.kicker, { color: '#34D399' }]}>JE SUIS MUSICIEN · MON RETOUR</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={code} onChangeText={setCode} placeholder="172.20.10.2 · 1" placeholderTextColor={theme.muted} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
              <Pressable onPress={join} style={[styles.go, { backgroundColor: '#34D399', opacity: code ? 1 : 0.5 }]}>
                <Text style={{ color: '#052E1F', fontWeight: '800', fontSize: 16 }}>Rejoindre</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setQrOpen(true)} style={[styles.go, { borderWidth: 2, borderColor: '#34D399', alignItems: 'center', height: 46 }]}>
              <Text style={{ color: '#6EE7B7', fontWeight: '800', fontSize: 15 }}>📷 Scanner le QR code du sondier</Text>
            </Pressable>
            <QrScanner theme={theme} visible={qrOpen} onClose={() => setQrOpen(false)} onCode={(t) => {
              setQrOpen(false);
              const full = parseInvite(t);
              const short = full ? null : parseShortCode(t);
              const cfg: MonConfig | null = full ?? (short ? { host: short.host, bus: short.bus, name: `Retour ${short.bus}`, me: [], rights: DEFAULT_RIGHTS } : null);
              if (cfg) connect(cfg.host, false, cfg); else setError('Ce QR code n’est pas une invitation « Ma table ».');
            }} />
          </View>

          <Pressable onPress={() => connect('demo', true, undefined, false, true)} style={[styles.card, { borderColor: theme.accent, backgroundColor: theme.panel }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>🏠 Préparer chez moi, sans table</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Noms, couleurs, groupes, qui entend quoi… puis tout est envoyé à la table en arrivant (sauf les gains et le 48 V).</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>Table imitée par la démo :</Text>
            {XAIR_MODELS.filter((m) => m !== 'MR18').map((m) => (
              <Pressable key={m} onPress={() => { setDemoModel(m); setDemoM(m); save('demoModele', m); }} accessibilityRole="radio" accessibilityState={{ selected: demoM === m }}
                style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center', borderWidth: 2, borderColor: demoM === m ? theme.accent : theme.line2, backgroundColor: demoM === m ? theme.accent : 'transparent' }}>
                <Text style={{ color: demoM === m ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => connect('demo', true)} style={[styles.card, { flex: 1, borderColor: theme.line2 }]}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Démo sans table</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>rien n’est envoyé</Text>
            </Pressable>
            <Pressable onPress={() => connect('demo', true, undefined, true)} style={[styles.card, { flex: 1, borderColor: theme.line2 }]}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>Démo musicien</Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>le mode « Mon retour »</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {busy && <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />}
      {!!error && <Text style={{ color: theme.mute, marginTop: 8, fontWeight: '700' }}>{error}</Text>}
      <DebugScreen client={null} theme={theme} visible={dbgOpen} onClose={() => setDbgOpen(false)} />
    </ScrollView>
      {auto && (
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, zIndex: 50 }}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', textAlign: 'center' }}>Je retrouve ta table…</Text>
          <Text style={{ color: theme.muted, fontSize: 14, textAlign: 'center' }}>{auto.name}{auto.name !== auto.host ? ` · ${auto.host}` : ''}</Text>
          <Pressable onPress={() => { autoCancel.current = true; setAuto(null); setBusy(false); }} style={{ minHeight: 50, paddingHorizontal: 24, borderRadius: 14, borderWidth: 2, borderColor: theme.line2, justifyContent: 'center' }}>
            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>Annuler · choisir une autre table</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} jours`;
}
function Num({ n, c, theme }: { n: number; c: string; theme: Theme }) {
  return <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{n}</Text></View>;
}
function MixerIcon({ color, small }: { color: string; small?: boolean }) {
  const s = small ? 40 : 56;
  return (
    <Svg width={s} height={s} viewBox="0 0 56 56">
      <Rect x={3} y={8} width={50} height={40} rx={8} fill="none" stroke={color} strokeWidth={3} />
      {[14, 24, 34, 44].map((x, k) => (
        <React.Fragment key={x}>
          <Line x1={x} y1={16} x2={x} y2={40} stroke={color} strokeOpacity={0.4} strokeWidth={2} />
          <Rect x={x - 4} y={[30, 20, 34, 24][k]} width={8} height={5} rx={2} fill={color} />
        </React.Fragment>
      ))}
    </Svg>
  );
}
function Bars({ n, color }: { n: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 20, width: 26 }}>
      {[6, 10, 14, 19].map((h, k) => <View key={h} style={{ width: 4, height: h, borderRadius: 1, backgroundColor: k < n ? color : '#3A414B' }} />)}
    </View>
  );
}
function WifiIcon({ color }: { color: string }) {
  return (
    <Svg width={30} height={24} viewBox="0 0 30 24">
      <Path d="M2 8 Q15 -3 28 8" stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Path d="M7 13 Q15 6 23 13" stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Path d="M11 18 Q15 15 19 18" stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      <Circle cx={15} cy={21.5} r={2} fill={color} />
    </Svg>
  );
}
function Radar({ color, theme }: { color: string; theme: Theme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8 }}>
      <ActivityIndicator color={color} />
      <Text style={{ color: theme.muted }}>Je cherche les tables autour…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingTop: 40, gap: 16, paddingBottom: 40 },
  title: { fontSize: 30, fontWeight: '800' },
  logo: { width: 56, height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  hero: { borderWidth: 2, borderRadius: 20, padding: 16, gap: 8 },
  found: { borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  net: { borderWidth: 1, borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.8 },
  small: { height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 4 },
  input: { flex: 1, minWidth: 0, height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 },
  go: { height: 52, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', flexShrink: 0 },
});
