// Partager tout avec un ami (fichier .matable ou QR code animé), et recevoir.
// S'ouvre depuis l'accueil (sans table) ou depuis Réglages › Connexion.
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CloseX } from '../ui/kit';
import { QrSvg } from '../ui/QrSvg';
import { Theme } from '../ui/theme';
import { capture, Snapshot } from '../xair/snapshot';
import { XAirClient } from '../xair/XAirClient';
import { save } from '../store/persist';
import { applyBundle, Bundle, describe, makeBundle, parseBundle, QrCollector, qrFrames, undoImport } from '../store/share';

const fileName = (d = new Date()) => `ma-table-${d.toISOString().slice(0, 10)}.matable`;

/** Range une photo de table reçue comme « préparation » : proposée à la prochaine connexion. */
const savePrep = async (snap: Snapshot) => { await save('preparation', { snap, savedAt: Date.now() }); };

async function buildBundle(client: XAirClient | null): Promise<Bundle> {
  const snap = client && client.hostAddress !== 'demo' ? await capture(client, 'Reçu d’un ami') : client ? await capture(client, 'Démo') : null;
  return makeBundle(snap, client?.info?.model);
}

export async function shareFile(b: Bundle) {
  const text = JSON.stringify(b);
  try {
    const { File, Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const f = new File(Paths.cache, fileName());
    f.create({ overwrite: true });
    f.writeSync(text);
    await Sharing.shareAsync(f.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Envoyer Ma table', UTI: 'fr.remy.matable.bundle' });
  } catch {
    await Share.share({ message: text, title: fileName() });
  }
}

/** Lit un fichier .matable (choisi, ou ouvert depuis une autre appli). */
export async function readBundleFile(uri?: string): Promise<Bundle | null> {
  const { File } = await import('expo-file-system');
  if (uri) return parseBundle(await new File(uri).text());
  const r = await File.pickFileAsync({ mimeTypes: ['*/*'] } as never);
  if (!r || (r as { canceled?: boolean }).canceled) return null;
  const file = ((r as { result?: InstanceType<typeof File> }).result ?? r) as InstanceType<typeof File>;
  return parseBundle(await file.text());
}

type Step = 'menu' | 'qr' | 'scan' | 'confirm' | 'done';

export function ShareSheet({ theme, visible, onClose, client, incoming }: { theme: Theme; visible: boolean; onClose: () => void; client: XAirClient | null; incoming?: Bundle | null }) {
  const [step, setStep] = useState<Step>('menu');
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [k, setK] = useState(0);
  const [slow, setSlow] = useState(false);
  const [kept, setKept] = useState<string[]>([]);
  const [prog, setProg] = useState<{ got: number; total: number } | null>(null);
  const [perm, ask] = useCameraPermissions();
  const col = useRef(new QrCollector());
  const { width, height } = useWindowDimensions();
  const qrSize = Math.min(width - 60, height - 260, 520);

  useEffect(() => {
    if (!visible) return;
    if (incoming) { setBundle(incoming); setStep('confirm'); } else setStep('menu');
  }, [visible, incoming]);
  // le QR animé : une image toutes les 220 ms, en boucle
  useEffect(() => {
    if (step !== 'qr' || frames.length < 2) return;
    const t = setInterval(() => setK((x) => (x + 1) % frames.length), slow ? 500 : 220);
    return () => clearInterval(t);
  }, [step, frames.length, slow]);

  const close = () => { setStep('menu'); setProg(null); col.current = new QrCollector(); onClose(); };
  const startQr = async () => { const b = await buildBundle(client); setFrames(qrFrames(b)); setK(0); setStep('qr'); };
  const startFile = async () => { try { await shareFile(await buildBundle(client)); } catch (e) { Alert.alert('Partage impossible', String((e as Error).message ?? e)); } };
  const openFile = async () => {
    try { const b = await readBundleFile(); if (b) { setBundle(b); setStep('confirm'); } } catch (e) { Alert.alert('Fichier illisible', String((e as Error).message ?? e)); }
  };
  const keep = async () => { if (!bundle) return; setKept(await applyBundle(bundle, savePrep)); setStep('done'); };
  const onScan = (data: string) => {
    try {
      const r = col.current.add(data);
      if (!r) return;
      setProg({ got: r.got, total: r.total });
      if (r.bundle) { setBundle(r.bundle); setStep('confirm'); }
    } catch { /* image mal lue : on attend la suivante */ }
  };
  const big = (bg: string, fg: string) => [styles.big, { backgroundColor: bg }] as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }, step === 'scan' && { flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{step === 'confirm' || step === 'done' || step === 'scan' ? 'Recevoir d’un ami' : 'Partager avec un ami'}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Tout : la table réglée, la scène, les soirées, mes réglages, mes effets</Text>
            </View>
            <CloseX theme={theme} onPress={close} />
          </View>

          {step === 'menu' && (
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              <Text style={[styles.kicker, { color: theme.muted }]}>ENVOYER</Text>
              <Pressable onPress={startQr} style={big(theme.accent, theme.onAccent)}>
                <Text style={{ fontSize: 26 }}>▦</Text>
                <View style={{ flex: 1 }}><Text style={[styles.bt, { color: theme.onAccent }]}>Montrer le QR code animé</Text><Text style={{ color: theme.onAccent, fontSize: 12 }}>L’ami le filme avec Ma table : quelques secondes, sans internet</Text></View>
              </Pressable>
              <Pressable onPress={startFile} style={[styles.big, { borderWidth: 1, borderColor: theme.line2 }]}>
                <Text style={{ fontSize: 26 }}>📤</Text>
                <View style={{ flex: 1 }}><Text style={[styles.bt, { color: theme.text }]}>Envoyer le fichier .matable</Text><Text style={{ color: theme.muted, fontSize: 12 }}>AirDrop, Quick Share, WhatsApp, mail, Drive…</Text></View>
              </Pressable>
              <Text style={[styles.kicker, { color: theme.muted, marginTop: 6 }]}>RECEVOIR</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable onPress={() => { col.current = new QrCollector(); setProg(null); setStep('scan'); }} style={[styles.big, { flex: 1, borderWidth: 1, borderColor: theme.line2 }]}>
                  <Text style={{ fontSize: 22 }}>📷</Text><Text style={[styles.bt, { color: theme.text, flex: 1 }]}>Filmer son QR</Text>
                </Pressable>
                <Pressable onPress={openFile} style={[styles.big, { flex: 1, borderWidth: 1, borderColor: theme.line2 }]}>
                  <Text style={{ fontSize: 22 }}>📂</Text><Text style={[styles.bt, { color: theme.text, flex: 1 }]}>Ouvrir un fichier</Text>
                </Pressable>
              </View>
              {!client && <Text style={{ color: theme.muted, fontSize: 11 }}>Sans table connectée, on envoie la scène, les soirées et tes réglages. Connecté, on envoie aussi la table telle qu’elle est réglée.</Text>}
            </ScrollView>
          )}

          {step === 'qr' && frames.length > 0 && (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Pressable onPress={() => setSlow(!slow)} accessibilityLabel="Plus lent ou plus vite"><QrSvg value={frames[k]} size={qrSize} /></Pressable>
              <Text style={{ color: theme.text, fontWeight: '800' }}>Image {k + 1} / {frames.length} · {slow ? 'lent' : 'rapide'} (touche le code pour changer)</Text>
              <Text style={{ color: theme.muted, fontSize: 12, textAlign: 'center' }}>Sur l’autre téléphone : Ma table › Partager › 📷 Filmer son QR. Garde les deux écrans immobiles, luminosité à fond.</Text>
              <Pressable onPress={() => setStep('menu')} style={[styles.small, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>‹ Retour</Text></Pressable>
            </View>
          )}

          {step === 'scan' && (
            <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
              {Platform.OS !== 'web' && perm?.granted ? (
                <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r) => r.data && onScan(r.data)} />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16, textAlign: 'center' }}>{Platform.OS === 'web' ? 'Pas d’appareil photo dans le fichier de démo' : 'L’appareil photo sert à lire le QR code de ton ami'}</Text>
                  {Platform.OS !== 'web' && <Pressable onPress={ask} style={[styles.small, { backgroundColor: '#34D399', borderColor: '#34D399' }]}><Text style={{ color: '#052E1F', fontWeight: '800' }}>Autoriser l’appareil photo</Text></Pressable>}
                </View>
              )}
              <View pointerEvents="none" style={styles.prog}>
                <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>{prog ? `${prog.got} / ${prog.total} images reçues` : 'Vise le QR code de ton ami'}</Text>
                {prog && <View style={{ height: 8, width: 220, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: 8 }}><View style={{ height: 8, width: (220 * prog.got) / prog.total, borderRadius: 4, backgroundColor: '#34D399' }} /></View>}
              </View>
            </View>
          )}

          {step === 'confirm' && bundle && (
            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>Reçu{bundle.from.who ? ` de ${bundle.from.who}` : ''} le {new Date(bundle.date).toLocaleDateString('fr-FR')} :</Text>
              {describe(bundle).map((l) => <Text key={l} style={{ color: theme.text, fontSize: 14 }}>• {l}</Text>)}
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                Rien ne part à ta table maintenant : la table réglée sera proposée à ta prochaine connexion (sans les gains ni le 48 V). Tes soirées et réglages restent, la scène et la balance sont remplacées — tu pourras revenir en arrière.
                {bundle.from.model ? ` Faite sur une ${bundle.from.model} : si ta table est différente, ce qui n’existe pas chez toi est ignoré.` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={close} style={[styles.small, { flex: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Non merci</Text></Pressable>
                <Pressable onPress={keep} style={[styles.small, { flex: 2, backgroundColor: theme.accent, borderColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900' }}>Garder</Text></Pressable>
              </View>
            </View>
          )}

          {step === 'done' && (
            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.ok, fontSize: 16, fontWeight: '900' }}>✓ C’est rangé</Text>
              {kept.map((l) => <Text key={l} style={{ color: theme.text, fontSize: 14 }}>• {l}</Text>)}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={async () => { if (await undoImport()) { Alert.alert('C’est revenu comme avant'); close(); } }} style={[styles.small, { flex: 1, borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>↶ Revenir comme avant</Text></Pressable>
                <Pressable onPress={close} style={[styles.small, { flex: 1, backgroundColor: theme.accent, borderColor: theme.accent }]}><Text style={{ color: theme.onAccent, fontWeight: '900' }}>OK</Text></Pressable>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 12 },
  sheet: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12, width: '100%', maxWidth: 640, alignSelf: 'center', maxHeight: '100%' },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  big: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, minHeight: 64 },
  bt: { fontSize: 15, fontWeight: '900' },
  small: { minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  prog: { position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' },
});
