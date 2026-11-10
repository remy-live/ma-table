// Premier lancement : 3 étapes, une par écran, sans défiler.
// 1. Choisir un modèle  2. Brancher (qui va dans quelle prise)  3. Inviter les musiciens.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath } from '../xair/addresses';
import { XAirClient } from '../xair/XAirClient';
import { applyTemplate, TEMPLATES } from '../store/templates';
import { renameCurrent, safetyBackup, startNewSession } from '../store/sessions';
import { chColorOf } from '../xair/smartName';
import { MIX_COLORS } from './MixPicker';
import { InviteSheet } from './InviteSheet';
import { MonConfig } from '../xair/monitor';

const ICON: Record<string, string> = { solo: '🎤', duo: '👥', rock: '🎸', acou: '🪕', dj: '🎧', talk: '🗣' };
const STEP_NAMES = ['Ton modèle', 'Brancher', 'Inviter'];

export function FirstRun(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; onGestures: () => void; onTryHere: (cfg: MonConfig) => void }) {
  const { client, theme } = props;
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState<string>('keep');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(false);
  useEffect(() => { if (props.visible) { setStep(0); setPick('keep'); } }, [props.visible]);

  const next = async () => {
    if (step === 0) {
      setBusy(true);
      try {
        const tpl = TEMPLATES.find((t) => t.key === pick);
        if (tpl) {
          await safetyBackup(client, 'avant le premier modèle').catch(() => null);
          await startNewSession(client, 'same');
          await applyTemplate(client, tpl);
        }
        const nm = name.trim() || tpl?.name;
        if (nm) await renameCurrent(nm);
      } finally { setBusy(false); }
    }
    if (step < 2) setStep(step + 1); else props.onClose();
  };

  // ce qui est branché, d'après les noms des voies (après le modèle choisi)
  const chans = Array.from({ length: CH_COUNT }, (_, c) => c + 1).map((c) => ({ c, name: String(client.get(chNamePath(c)) ?? '') })).filter((x) => x.name);
  const buses = Array.from({ length: BUS_COUNT }, (_, n) => n + 1).map((n) => ({ n, name: String(client.get(busNamePath(n)) ?? '') })).filter((x) => x.name);
  const cols = wide ? 3 : 2;
  const cell = wide ? Math.min(250, (Math.min(width, 1100) - 80 - (cols - 1) * 8) / cols) : Math.floor((width - 24 - 32 - 8) / 2) - 1;

  return (
    <>
    <Modal visible={props.visible && !invite} animationType="fade" transparent onRequestClose={props.onClose}>
      <View style={styles.back}>
        <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line, maxWidth: wide ? 1100 : 560, maxHeight: height - 24 }]}>
          {/* les 3 étapes */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {STEP_NAMES.map((s, k) => (
              <React.Fragment key={s}>
                <View style={[styles.dot, { backgroundColor: k <= step ? theme.accent : theme.deep, borderColor: k <= step ? theme.accent : theme.line2 }]}><Text style={{ color: k <= step ? theme.onAccent : theme.muted, fontWeight: '900', fontSize: 13 }}>{k < step ? '✓' : k + 1}</Text></View>
                {(wide || k === step) && <Text numberOfLines={1} style={{ color: k === step ? theme.text : theme.muted, fontWeight: '800', fontSize: 13 }}>{s}</Text>}
                {k < 2 && <View style={{ flex: 1, height: 2, backgroundColor: k < step ? theme.accent : theme.line }} />}
              </React.Fragment>
            ))}
            <Pressable onPress={props.onClose} hitSlop={10} accessibilityLabel="Passer le démarrage" style={{ marginLeft: 8 }}><Text style={{ color: theme.muted, fontWeight: '800' }}>Passer ✕</Text></Pressable>
          </View>

          {step === 0 && (
            <View style={{ gap: 8, flexShrink: 1 }}>
              <Text style={[styles.h, { color: theme.text }]}>Bienvenue ! Tu joues avec quoi ?</Text>
              <Text style={{ color: theme.muted, fontSize: 13 }}>Un modèle nomme les prises, fait les groupes, prépare les retours et un premier mix. Il ne touche jamais aux gains ni au 48 V.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[{ key: 'keep', name: 'Garder la table', desc: 'telle qu’elle est réglée', icon: '' }, ...TEMPLATES].map((t) => {
                  const on = pick === t.key;
                  return (
                    <Pressable key={t.key} onPress={() => setPick(t.key)} accessibilityState={{ selected: on }} style={[styles.tpl, { width: cell, minHeight: wide ? 70 : 52, borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.accent + '22' : theme.deep }]}>
                      <Text style={{ fontSize: wide ? 24 : 18 }}>{ICON[t.icon] ?? '🎛'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '900', fontSize: wide ? 15 : 13 }}>{t.name}</Text>
                        <Text numberOfLines={wide ? 2 : 1} style={{ color: theme.muted, fontSize: 11 }}>{t.desc}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput value={name} onChangeText={setName} placeholder="Nom du mixage (facultatif) : Bar du Port, Répète jeudi…" placeholderTextColor={theme.muted} maxLength={40}
                style={{ minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: theme.line2, backgroundColor: theme.deep, color: theme.text, paddingHorizontal: 12, fontSize: 15, fontWeight: '700' }} />
            </View>
          )}

          {step === 1 && (
            <View style={{ gap: 8, flexShrink: 1 }}>
              <Text style={[styles.h, { color: theme.text }]}>Branche chaque câble dans sa prise</Text>
              <Text style={{ color: theme.muted, fontSize: 13 }}>Le numéro est écrit sur la table. Pas encore branché ? Pas grave, tout se retrouve dans « Branchements ».</Text>
              <Text style={[styles.kick, { color: theme.muted }]}>ENTRÉES · les micros et instruments</Text>
              {chans.length === 0 ? <Text style={{ color: theme.muted }}>Aucune prise nommée pour l’instant.</Text> : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {chans.map(({ c, name: n }) => {
                    const col = chColorOf(Number(client.get(`/ch/${String(c).padStart(2, '0')}/config/color`) ?? 0), c);
                    return (
                      <View key={c} style={[styles.plug, { borderColor: col, backgroundColor: theme.deep }]}>
                        <View style={[styles.jack, { borderColor: col }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 13 }}>{c}</Text></View>
                        <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 13, maxWidth: 120 }}>{n}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
              <Text style={[styles.kick, { color: theme.muted }]}>SORTIES · ce qui sort de la table</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <View style={[styles.plug, { borderColor: MIX_COLORS[0], backgroundColor: theme.deep }]}>
                  <View style={[styles.jack, { borderColor: MIX_COLORS[0], width: 52 }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 11 }}>MAIN</Text></View>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>👥 les enceintes du public</Text>
                </View>
                {buses.map(({ n, name: bn }) => (
                  <View key={n} style={[styles.plug, { borderColor: MIX_COLORS[n] ?? theme.line2, backgroundColor: theme.deep }]}>
                    <View style={[styles.jack, { borderColor: MIX_COLORS[n] ?? theme.line2, width: 52 }]}><Text style={{ color: theme.text, fontWeight: '900', fontSize: 11 }}>AUX {n}</Text></View>
                    <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 13, maxWidth: 140 }}>🎧 {bn}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <View style={{ gap: 10, flexShrink: 1, alignItems: 'center' }}>
              <Text style={[styles.h, { color: theme.text, textAlign: 'center' }]}>Chaque musicien règle son retour</Text>
              <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center', maxWidth: 560 }}>Il scanne un QR code avec son téléphone : il ne voit que son retour, il ne peut rien casser dans le mix du public.</Text>
              <Pressable onPress={() => setInvite(true)} style={[styles.big, { backgroundColor: '#13261E', borderColor: '#1F6F4A' }]}>
                <Text style={{ color: '#A7F3D0', fontSize: 18, fontWeight: '900' }}>📱 Montrer le QR code</Text>
                <Text style={{ color: '#6EE7B7', fontSize: 12 }}>tu peux aussi le faire plus tard, depuis Concert</Text>
              </Pressable>
              <Pressable onPress={() => { props.onClose(); props.onGestures(); }} style={[styles.big, { backgroundColor: theme.deep, borderColor: '#A78BFA', minHeight: 56 }]}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800' }}>👆 Voir les gestes en 30 s</Text>
              </Pressable>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 'auto' }}>
            {step > 0 && <Pressable onPress={() => setStep(step - 1)} style={[styles.btn, { borderColor: theme.line2, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>‹ Retour</Text></Pressable>}
            <Pressable onPress={next} disabled={busy} style={[styles.btn, { flex: 2, backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '900', fontSize: 15 }}>{busy ? '…' : step === 0 ? (pick === 'keep' ? 'Suivant ›' : `Préparer « ${TEMPLATES.find((t) => t.key === pick)?.name} » ›`) : step === 1 ? 'C’est branché ›' : 'C’est parti !'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    {/* le QR code s'ouvre à la place, puis on revient à l'étape 3 */}
    <InviteSheet client={client} theme={theme} visible={props.visible && invite} onClose={() => setInvite(false)} onTryHere={(cfg) => { setInvite(false); props.onClose(); props.onTryHere(cfg); }} />
    </>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 12 },
  sheet: { width: '100%', borderRadius: 22, borderWidth: 1, padding: 16, gap: 12 },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  h: { fontSize: 21, fontWeight: '900' },
  kick: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  tpl: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  plug: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 22, paddingRight: 12, paddingLeft: 4, paddingVertical: 4 },
  jack: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  big: { width: '100%', maxWidth: 520, minHeight: 72, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 2 },
  btn: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
