// « Tester l'enregistrement USB » : un seul bouton fait tout l'essai et écrit un
// rapport. 1) ce que la tablette voit, 2) combien de voies elle accepte,
// 3) 10 s d'enregistrement, un fichier par voie, à réécouter.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { Theme } from '../ui/theme';
import * as dbg from '../debug/log';
import { chNamePath } from '../xair/addresses';
import { askMic, isUsb, ProbeOpts, ProbeResult, RecordResult, SRC_MIC, SRC_UNPROCESSED, TRY_CHANNELS, usbAudio, UsbHostDevice, UsbInput } from '../xair/usbAudio';
import { XAirClient } from '../xair/XAirClient';

type Phase = 'idle' | 'look' | 'probe' | 'rec' | 'done';
interface ProbeRow { label: string; o: ProbeOpts; r: ProbeResult }

const fmtDb = (d: number) => (d <= -119 ? 'rien' : `${d > 0 ? '+' : ''}${d.toFixed(1)} dB`);
const fmtHex = (n: number) => `0x${n.toString(16).padStart(4, '0')}`;

export function UsbTestSheet({ client, theme, visible, onClose }: { client: XAirClient | null; theme: Theme; visible: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState('');
  const [inputs, setInputs] = useState<UsbInput[]>([]);
  const [host, setHost] = useState<UsbHostDevice[]>([]);
  const [rows, setRows] = useState<ProbeRow[]>([]);
  const [live, setLive] = useState<number[]>([]);
  const [t, setT] = useState(0);
  const [res, setRes] = useState<RecordResult | null>(null);
  const [best, setBest] = useState<ProbeOpts | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [secs, setSecs] = useState(10);
  const report = useRef<string[]>([]);
  const log = (s: string) => { report.current.push(s); };

  useEffect(() => {
    if (!visible) return;
    const sub = usbAudio?.addListener('onLevels', (e) => { setLive(e.peaks); setT(e.t); });
    return () => { sub?.remove(); usbAudio?.stopPlay(); };
  }, [visible]);

  const trackName = (k: number) => {
    const n = k + 1;
    const nm = n <= 16 && client ? String(client.get(chNamePath(n)) ?? '') : '';
    return nm ? `${n} · ${nm}` : `Piste ${n}`;
  };

  const runAll = async () => {
    if (!usbAudio) return;
    report.current = [];
    setRows([]); setRes(null); setBest(null); setLive([]);
    setPhase('look');
    const info = usbAudio.info();
    log(`Tablette : ${info.maker} ${info.model} · Android ${info.android} (SDK ${info.sdk}) · sortie ${info.outRate} Hz`);
    if (!(await askMic())) { setMsg('Il faut autoriser l’enregistrement (micro) pour lire le son de la table.'); log('Permission micro refusée'); setPhase('done'); return; }
    const hs = usbAudio.usbHost();
    setHost(hs);
    log(`Port USB : ${hs.length} appareil(s)`);
    for (const d of hs) {
      log(`  ${d.maker} ${d.product} (${fmtHex(d.vendor)}:${fmtHex(d.productId)})`);
      for (const itf of d.interfaces) log(`    interface ${itf.id} alt ${itf.alt} classe ${itf.cls}/${itf.sub}/${itf.proto} · ${itf.eps.map((e) => `${e.in ? 'IN' : 'OUT'} ${fmtHex(e.addr)} t${e.type} max ${e.max}`).join(', ') || 'aucun point'}`);
    }
    const ins = usbAudio.devices();
    setInputs(ins);
    for (const d of ins) log(`Entrée Android : ${d.type} « ${d.product} » id ${d.id} · voies ${d.channelCounts.join('/') || '?'} · masques ${d.indexMasks.length} · fréquences ${d.sampleRates.join('/') || 'toutes'} · encodages ${d.encodings.join('/') || '?'}`);
    const usb = ins.find(isUsb);
    if (!usb) {
      setMsg(hs.length ? 'Le port USB voit la table, mais Android ne la propose pas comme entrée son. Envoie-moi le rapport : il faudra lire la carte son en direct.' : 'La tablette ne voit rien sur l’USB. Vérifie : table allumée, câble USB-C vers USB-B branché directement (sans hub), et accepte la fenêtre qui s’ouvre au branchement.');
      log('Pas d’entrée son USB');
      setPhase('done');
      return;
    }
    setPhase('probe');
    const out: ProbeRow[] = [];
    const tryOne = async (label: string, o: ProbeOpts) => {
      const r = await usbAudio!.probe(o);
      out.push({ label, o, r });
      setRows([...out]);
      log(`Essai ${label} : ${r.ok ? 'OK' : 'NON'}${r.error ? ` (${r.error})` : ''}${r.channels ? ` · reçu ${r.channels} voies à ${r.rate} Hz` : ''}${r.routed ? ` · par ${r.routed}` : ''}${r.peakDb !== undefined ? ` · niveau ${fmtDb(r.peakDb)}` : ''}`);
      return r;
    };
    // 1) la fréquence de la table
    let rate = 0;
    for (const rt of [48000, 44100]) {
      const r = await tryOne(`stéréo ${rt / 1000} kHz`, { deviceId: usb.id, ch: 2, float: false, rate: rt, src: SRC_MIC, positional: true });
      if (r.ok) { rate = rt; break; }
    }
    if (!rate) rate = 48000;
    // 2) le plus de voies possible
    let max: ProbeOpts | null = null;
    for (const ch of TRY_CHANNELS) {
      const o = { deviceId: usb.id, ch, float: false, rate, src: SRC_MIC, positional: false };
      const r = await tryOne(`${ch} voies`, o);
      if (r.ok && (r.channels ?? ch) >= ch) { max = o; break; }
    }
    if (!max) {
      const o = { deviceId: usb.id, ch: 2, float: false, rate, src: SRC_MIC, positional: true };
      if (out.find((x) => x.o.positional && x.o.rate === rate)?.r.ok) max = o;
    }
    // 3) variantes utiles sur le meilleur réglage : 32 bits flottant, source « non traitée »
    if (max) {
      await tryOne(`${max.ch} voies · 32 bits`, { ...max, float: true });
      await tryOne(`${max.ch} voies · sans traitement`, { ...max, src: SRC_UNPROCESSED });
    }
    setBest(max);
    if (!max) { setMsg('Aucun réglage n’a marché. Envoie-moi le rapport.'); setPhase('done'); return; }
    setMsg('');
    setPhase('idle');
  };

  const record = async (o: ProbeOpts) => {
    if (!usbAudio) return;
    setPhase('rec');
    setRes(null);
    setLive(Array(o.ch).fill(-120));
    try {
      const r = await usbAudio.record({ ...o, seconds: secs });
      setRes(r);
      const lost = r.expected > 0 ? Math.max(0, 1 - r.frames / r.expected) : 0;
      log(`Enregistrement ${r.channels} voies ${r.rate} Hz · ${r.seconds.toFixed(1)} s · ${r.frames} images sur ${r.expected} attendues (${(lost * 100).toFixed(1)} % manquant) · lectures courtes ${r.shortReads} · erreurs ${r.readErrors} · par ${r.routed}`);
      r.peakDb.forEach((p, k) => log(`  ${trackName(k)} : crête ${fmtDb(p)} · moyenne ${fmtDb(r.rmsDb[k])}${r.clips[k] ? ` · ${r.clips[k]} saturations` : ''}`));
      dbg.info(`Test USB : ${r.channels} voies à ${r.rate} Hz, ${(lost * 100).toFixed(1)} % manquant`);
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      log(`Enregistrement impossible : ${m}`);
      setMsg(`Enregistrement impossible : ${m}`);
    }
    setPhase('done');
  };

  const text = () => report.current.join('\n');
  const shareReport = () => {
    dbg.info(`Rapport test USB\n${text()}`);
    Share.share({ message: `Ma table · test enregistrement USB\n${text()}` });
  };
  const shareFile = async (path: string) => {
    try {
      const Sharing = await import('expo-sharing');
      await Sharing.shareAsync(`file://${path}`, { mimeType: 'audio/wav', dialogTitle: 'Envoyer la piste' });
    } catch (e) { setMsg(`Partage impossible : ${String((e as Error)?.message ?? e)}`); }
  };
  const play = (k: number) => {
    if (!usbAudio || !res) return;
    if (playing === k) { usbAudio.stopPlay(); setPlaying(null); return; }
    try { usbAudio.play(res.files[k]); setPlaying(k); } catch (e) { setMsg(`Lecture impossible : ${String((e as Error)?.message ?? e)}`); }
  };

  const busy = phase === 'look' || phase === 'probe' || phase === 'rec';
  const usbIn = inputs.find(isUsb);
  const lost = res && res.expected > 0 ? Math.max(0, 1 - res.frames / res.expected) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontSize: 24 }}>🎙</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Tester l’enregistrement USB</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Câble USB-C (tablette) → USB-B (table), branché directement.</Text>
            </View>
            <CloseX theme={theme} onPress={() => { usbAudio?.stop(); usbAudio?.stopPlay(); onClose(); }} />
          </View>

          {!usbAudio ? (
            <Text style={{ color: theme.text, fontSize: 14 }}>{Platform.OS === 'android' ? 'Ce module n’est pas dans cette version de l’appli : installe le dernier APK.' : 'Pour l’instant seulement sur Android (tablette Xiaomi).'}</Text>
          ) : (
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
              <Pressable disabled={busy} onPress={runAll} style={[styles.go, { backgroundColor: theme.accent, opacity: busy ? 0.5 : 1 }]}>
                <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 16 }}>{phase === 'look' ? 'Je regarde l’USB…' : phase === 'probe' ? `J’essaie les réglages… (${rows.length})` : rows.length ? '↻ Refaire tout le test' : '▶ Lancer le test'}</Text>
              </Pressable>
              {!!msg && <Text style={{ color: '#FCA5A5', fontSize: 13, fontWeight: '700' }}>{msg}</Text>}

              {(host.length > 0 || inputs.length > 0) && (
                <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>1 · CE QUE LA TABLETTE VOIT</Text>
                  {host.map((d) => <Text key={d.name} style={{ color: theme.text, fontSize: 13 }}>🔌 {d.maker} {d.product || 'appareil USB'} · {d.interfaces.filter((x) => x.cls === 1).length} interfaces audio</Text>)}
                  {usbIn ? <Text style={{ color: theme.ok, fontSize: 13, fontWeight: '700' }}>✓ Entrée son : « {usbIn.product} » · Android annonce {usbIn.channelCounts.length ? `${Math.max(...usbIn.channelCounts)} voies max` : 'un nombre de voies inconnu'}</Text>
                    : <Text style={{ color: '#FCA5A5', fontSize: 13 }}>✗ Pas d’entrée son USB pour Android</Text>}
                </View>
              )}

              {rows.length > 0 && (
                <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>2 · LES RÉGLAGES ESSAYÉS</Text>
                  {rows.map((r, k) => (
                    <Text key={k} style={{ color: r.r.ok ? theme.text : theme.muted, fontSize: 13 }}>
                      {r.r.ok ? '✓' : '✗'} {r.label}{r.r.ok && r.r.channels ? ` · ${r.r.channels} voies reçues` : ''}{!r.r.ok && r.r.error ? ` · ${r.r.error}` : ''}
                    </Text>
                  ))}
                  {best && <Text style={{ color: theme.ok, fontSize: 14, fontWeight: '800' }}>➜ Le mieux : {best.ch} voies à {best.rate / 1000} kHz</Text>}
                </View>
              )}

              {best && (
                <View style={[styles.box, { borderColor: theme.accent, backgroundColor: theme.deep }]}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>3 · ENREGISTRER UN ESSAI</Text>
                  <Text style={{ color: theme.text, fontSize: 13 }}>Pendant l’essai, fais parler ou jouer dans plusieurs micros. Chaque voie aura son fichier.</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[10, 30, 60].map((s) => (
                      <Pressable key={s} onPress={() => setSecs(s)} style={[styles.chip, { borderColor: secs === s ? theme.accent : theme.line2, backgroundColor: secs === s ? theme.accent : 'transparent' }]}>
                        <Text style={{ color: secs === s ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>{s} s</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable disabled={busy} onPress={() => record(best)} style={[styles.go, { flex: 2, backgroundColor: '#DC2626', opacity: busy ? 0.5 : 1 }]}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 15 }}>{phase === 'rec' ? `⏺ ${(t / 1000).toFixed(0)} / ${secs} s` : `⏺ Enregistrer ${best.ch} voies`}</Text>
                    </Pressable>
                    {phase === 'rec' ? (
                      <Pressable onPress={() => usbAudio?.stop()} style={[styles.go, { flex: 1, borderWidth: 1.5, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>■ Arrêter</Text></Pressable>
                    ) : best.ch > 2 && (
                      <Pressable disabled={busy} onPress={() => record({ ...best, ch: 2, positional: true })} style={[styles.go, { flex: 1, borderWidth: 1.5, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Seulement 2</Text></Pressable>
                    )}
                  </View>
                  {live.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                      {live.map((d, k) => {
                        const w = Math.max(0, Math.min(1, (d + 60) / 60));
                        const c = d > -3 ? '#EF4444' : d > -18 ? '#FACC15' : '#34D399';
                        return (
                          <View key={k} style={{ width: '48%', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text numberOfLines={1} style={{ width: 92, color: theme.muted, fontSize: 11 }}>{trackName(k)}</Text>
                            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.line }}><View style={{ width: `${w * 100}%`, height: 8, borderRadius: 4, backgroundColor: c }} /></View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {res && (
                <View style={[styles.box, { borderColor: theme.line, backgroundColor: theme.deep }]}>
                  <Text style={[styles.kicker, { color: theme.muted }]}>4 · LE RÉSULTAT</Text>
                  <Text style={{ color: lost > 0.01 ? '#FCA5A5' : theme.ok, fontSize: 14, fontWeight: '800' }}>
                    {res.channels} pistes · {res.seconds.toFixed(1)} s · {lost > 0.01 ? `⚠ ${(lost * 100).toFixed(1)} % du son manquant (coupures)` : '✓ sans coupure'}
                  </Text>
                  {res.peakDb.map((p, k) => (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text numberOfLines={1} style={{ flex: 1, color: p <= -90 ? theme.muted : theme.text, fontSize: 13, fontWeight: '700' }}>{trackName(k)}</Text>
                      <Text style={{ width: 120, color: res.clips[k] ? '#FCA5A5' : p <= -90 ? theme.muted : theme.text, fontSize: 12 }}>{p <= -90 ? 'silence' : `crête ${fmtDb(p)}`}{res.clips[k] ? ' · sature' : ''}</Text>
                      <Pressable onPress={() => play(k)} style={[styles.mini, { borderColor: playing === k ? theme.accent : theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>{playing === k ? '■' : '▶'}</Text></Pressable>
                      <Pressable onPress={() => shareFile(res.files[k])} style={[styles.mini, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>⤴</Text></Pressable>
                    </View>
                  ))}
                  <Text style={{ color: theme.muted, fontSize: 11 }}>Pistes 1 à 16 = les voies de la table si le routage USB est celui d’origine. Fichiers WAV 16 bits, rangés dans l’appli.</Text>
                </View>
              )}

              {report.current.length > 0 && !busy && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={shareReport} style={[styles.go, { flex: 1, backgroundColor: theme.ok }]}><Text style={{ color: '#052E1F', fontWeight: '900' }}>📤 Envoyer le rapport</Text></Pressable>
                  <Pressable onPress={() => { usbAudio?.clear(); setRes(null); }} style={[styles.go, { borderWidth: 1, borderColor: theme.line2, paddingHorizontal: 12 }]}><Text style={{ color: theme.text, fontWeight: '700' }}>Effacer les essais</Text></Pressable>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  sheet: { width: '100%', maxWidth: 720, borderRadius: 20, borderWidth: 1, padding: 16, gap: 10, maxHeight: '96%' },
  box: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  go: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  chip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  mini: { width: 40, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
