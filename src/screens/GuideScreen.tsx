// Mode guidé pour débutant : 5 étapes, une seule chose à la fois.
// 1 Ce qui est branché · 2 Groupes · 3 Ce que chacun veut entendre · 4 Ambiance · 5 Balance
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { FxVisual } from '../ui/FxVisual';
import { GainTile } from '../ui/GainTile';
import { GROUP_COLORS } from './GroupsSheet';
import { MIX_COLORS } from './MixPicker';
import { i, s } from '../osc/osc';
import { save } from '../store/persist';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chDcaPath, chNamePath, dcaNamePath, headampGainPath, inDca, MAIN, MODEL, phantomPath, Target, targetId } from '../xair/addresses';
import { applyRecipe, RECIPES } from '../xair/effects';
import { readGroups } from '../xair/groups';
import { applyNeed, currentNeed, hasPreamp, INSTRUMENTS, Need, NEEDS } from '../xair/guide';
import { capture } from '../xair/snapshot';
import { applySmartName, colorOf, findOrCreateGroup, recognize } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';
import { GroupsSheet } from './GroupsSheet';
import { AutoBalanceScreen } from './AutoBalanceScreen';

const STEPS = ['Ce qui est branché', 'Mes groupes', 'Qui veut entendre quoi', 'L’ambiance', 'La balance'];

function useTick(client: XAirClient) {
  const [t, setT] = useState(0);
  useEffect(() => client.on('*', (_v, p) => (p.endsWith('/config/name') || p.endsWith('/grp/dca') || p.includes('/level')) && setT((x) => x + 1)), [client]);
  return t;
}

export function GuideScreen(props: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void }) {
  const { client, theme } = props;
  const [step, setStep] = useState(0);
  useTick(client);
  useEffect(() => {
    if (!props.visible) return;
    const p: string[] = [];
    for (let c = 1; c <= CH_COUNT; c++) {
      p.push(chNamePath(c));
      for (let b = 1; b <= BUS_COUNT; b++) p.push(`/ch/${String(c).padStart(2, '0')}/mix/${String(b).padStart(2, '0')}/level`);
    }
    client.loadPaths(p);
  }, [client, props.visible]);

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '700' }}>ÉTAPE {step + 1} SUR 5</Text>
            <Text style={[styles.title, { color: theme.text }]}>{STEPS[step]}</Text>
          </View>
          <Pressable onPress={props.onClose} style={[styles.quit, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>Quitter</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
          {STEPS.map((_, k) => (
            <Pressable key={k} onPress={() => setStep(k)} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: k <= step ? theme.accent : theme.track }} accessibilityLabel={`Aller à l’étape ${k + 1}`} />
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          {step === 0 && <StepPlugged client={client} theme={theme} />}
          {step === 1 && <StepGroups client={client} theme={theme} />}
          {step === 2 && <StepNeeds client={client} theme={theme} />}
          {step === 3 && <StepAmbiance client={client} theme={theme} />}
          {step === 4 && <StepBalance client={client} theme={theme} />}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 24 }}>
          <Pressable onPress={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0} style={[styles.nav, { borderColor: theme.line2, borderWidth: 1, opacity: step === 0 ? 0.4 : 1 }]}>
            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>Précédent</Text>
          </Pressable>
          {step < 4 ? (
            <Pressable onPress={() => setStep((x) => x + 1)} style={[styles.nav, { backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>Suivant</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={async () => {
                const snap = await capture(client, 'Balance');
                await save('balance', snap);
                Alert.alert('C’est prêt', 'La balance est enregistrée. Sur l’écran Scène, « Revenir à la balance » la rappelle d’un geste.');
                props.onClose();
              }}
              style={[styles.nav, { backgroundColor: theme.ok }]}
            >
              <Text style={{ color: '#052E1F', fontWeight: '800', fontSize: 15 }}>Terminer et enregistrer</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------- 1. Ce qui est branché : la table vue de derrière ----------
const ICON: Record<string, string> = {
  Voix: '🎤', Chœurs: '👥', 'Guitare acou': '🪕', 'Guitare élec': '🎸', Basse: '🎸', Kick: '🥁', 'Caisse claire': '🥁', Charley: '🔔', Toms: '🥁', Overhead: '✨', Clavier: '🎹', Ordi: '💻', Rien: '✕',
};
const iconFor = (name: string) => {
  const r = recognize(name);
  const k = r ? (INSTRUMENTS.find((x) => x.toLowerCase() === r.label.toLowerCase()) ?? r.label) : '';
  return ICON[k] ?? (name ? '🎵' : '');
};

function Jack({ n, name, color, sel, onPress, small }: { n: number; name: string; color: string; sel: boolean; onPress: () => void; small?: boolean }) {
  const s = small ? 54 : 70;
  return (
    <Pressable onPress={onPress} accessibilityLabel={`Prise ${n} : ${name || 'rien'}`} style={{ alignItems: 'center', width: s + 26, gap: 4 }}>
      <Text style={{ color: '#9AA3AD', fontSize: 12, fontWeight: '800' }}>{n}</Text>
      <View style={{ width: s, height: s, borderRadius: s / 2, borderWidth: sel ? 5 : 4, borderColor: sel ? '#FFFFFF' : name ? color : '#3A414B', backgroundColor: '#1E2227', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: s * 0.55, height: s * 0.55, borderRadius: s, backgroundColor: '#0B0D10', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: small ? 16 : 20 }}>{iconFor(name)}</Text>
        </View>
      </View>
      <View style={{ minHeight: 20, paddingHorizontal: 6, borderRadius: 6, backgroundColor: name ? color : 'transparent', justifyContent: 'center' }}>
        <Text numberOfLines={1} style={{ color: name ? '#0B0D10' : '#5B636D', fontSize: 11, fontWeight: '800', maxWidth: s + 20 }}>{name || 'libre'}</Text>
      </View>
    </Pressable>
  );
}

function StepPlugged({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [pick, setPick] = useState<number>(1);
  const wide = useWindowDimensions().width >= 900;
  const nameOf = (c: number) => String(client.get(chNamePath(c)) ?? '');
  const colOf = (c: number) => colorOf(Number(client.get(`/ch/${String(c).padStart(2, '0')}/config/color`) ?? 0));
  const choose = (ch: number, label: string) => {
    if (label === 'Rien') client.set(chNamePath(ch), s(''));
    else {
      const rec = recognize(label);
      applySmartName(client, ch, label, rec, { color: true, group: true, preset: true });
      if (rec?.phantom && hasPreamp(ch)) {
        Alert.alert('Micro statique ?', `${label} se prend souvent avec un micro qui a besoin du 48 V. Allumer le 48 V sur la prise ${ch} ?`, [
          { text: 'Non', style: 'cancel' },
          { text: 'Oui, allumer', onPress: () => client.set(phantomPath(ch), i(1)) },
        ]);
      }
    }
    if (ch < CH_COUNT) setPick(ch + 1); // on passe à la prise suivante
  };
  const row = (from: number) => Array.from({ length: 8 }, (_, k) => from + k).filter((c) => c <= CH_COUNT);
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Voici ta table vue de derrière. Touche une prise, puis ce qui y est branché : l’appli nomme, colore, range en groupe et pose un préréglage, puis passe à la prise suivante.</Text>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12 }}>
        <View style={[styles.card, { flex: 1.4, backgroundColor: '#15181C', borderColor: '#2A3038' }]}>
          <Text style={{ color: '#E8EAED', fontSize: 16, fontWeight: '800', alignSelf: 'flex-end' }}>{MODEL.name}</Text>
          {[1, 9].map((f0) => (
            <View key={f0} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {row(f0).map((c) => <Jack key={c} n={c} name={nameOf(c)} color={colOf(c)} sel={pick === c} small={!wide} onPress={() => setPick(c)} />)}
            </View>
          ))}
        </View>
        <View style={[styles.card, { flex: 1, backgroundColor: theme.panel, borderColor: theme.accent }]}>
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '800' }}>PRISE {pick}</Text>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>{nameOf(pick) || 'Qu’est-ce qui est branché ?'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...INSTRUMENTS, 'Rien'].map((l) => (
              <Pressable key={l} onPress={() => choose(pick, l)} style={[styles.inst, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                <Text style={{ fontSize: 26 }}>{ICON[l] ?? '🎵'}</Text>
                <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

// ---------- 2. Groupes ----------
function StepGroups({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const groups = readGroups(client);
  const all = Array.from({ length: CH_COUNT }, (_, n) => n + 1);
  const fam = (c: number) => recognize(String(client.get(chNamePath(c)) ?? ''))?.group ?? null;
  const loose = all.filter((c) => String(client.get(chNamePath(c)) ?? '') && !groups.some((g) => g.members.includes(c)));
  const auto = () => {
    let n = 0;
    all.forEach((c) => {
      const fm = fam(c);
      if (!fm) return;
      const g = findOrCreateGroup(client, fm);
      const m = Number(client.get(chDcaPath(c)) ?? 0);
      if (g && !inDca(m, g)) { client.set(chDcaPath(c), i(m | (1 << (g - 1)))); n++; }
    });
    setMsg(n ? `${n} voie${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''}` : 'Rien de plus à ranger');
  };
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Un groupe monte ou baisse plusieurs voies d’un coup (toute la batterie, toutes les voix…), dans la façade comme dans les retours.</Text>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {Array.from({ length: 4 }, (_, k) => k + 1).map((k) => {
          const g = groups.find((x) => x.k === k);
          const c = GROUP_COLORS[k - 1];
          return (
            <View key={k} style={[styles.card, { flexGrow: 1, flexBasis: 220, backgroundColor: theme.panel, borderColor: g?.members.length ? c : theme.line, borderWidth: 2 }]}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c }} />
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>{String(client.get(dcaNamePath(k)) ?? '') || `Groupe ${k}`}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {(g?.members ?? []).map((ch) => (
                  <View key={ch} style={{ height: 28, paddingHorizontal: 8, borderRadius: 14, borderWidth: 2, borderColor: colorOf(Number(client.get(`/ch/${String(ch).padStart(2, '0')}/config/color`) ?? 0)), justifyContent: 'center' }}>
                    <Text style={{ color: theme.text, fontSize: 12, fontWeight: '700' }}>{iconFor(String(client.get(chNamePath(ch)) ?? ''))} {String(client.get(chNamePath(ch)) ?? '') || `Voie ${ch}`}</Text>
                  </View>
                ))}
                {!g?.members.length && <Text style={{ color: theme.muted, fontSize: 12 }}>vide</Text>}
              </View>
            </View>
          );
        })}
      </View>
      {loose.length > 0 && <Text style={{ color: theme.muted, fontSize: 12 }}>Hors groupe : {loose.map((c) => String(client.get(chNamePath(c)))).join(' · ')}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={auto} style={[styles.big, { flex: 1, backgroundColor: theme.accent, borderColor: theme.accent }]}>
          <Text style={{ color: theme.onAccent, fontWeight: '800', fontSize: 15 }}>✨ Ranger d’après les noms</Text>
        </Pressable>
        <Pressable onPress={() => setOpen(true)} style={[styles.big, { flex: 1, borderColor: theme.accent }]}>
          <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 15 }}>Modifier à la main</Text>
        </Pressable>
      </View>
      {!!msg && <Text style={{ color: '#34D399', fontWeight: '800' }}>{msg}</Text>}
      <GroupsSheet client={client} theme={theme} visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

// ---------- 3. Qui veut entendre quoi : un tableau de bulles ----------
const NEED_ORDER: Need[] = ['rien', 'bas', 'moyen', 'fort'];
function StepNeeds({ client, theme }: { client: XAirClient; theme: Theme }) {
  const people: { t: Target; name: string; color: string }[] = [
    { t: MAIN, name: 'Le public', color: MIX_COLORS[0] },
    ...Array.from({ length: BUS_COUNT }, (_, k) => ({ t: { kind: 'bus', n: k + 1 } as Target, name: String(client.get(busNamePath(k + 1)) ?? '') || `Retour ${k + 1}`, color: MIX_COLORS[k + 1] ?? '#9AA3AD' })),
  ];
  const [ren, setRen] = useState<{ n: number; v: string } | null>(null);
  const groups = readGroups(client).filter((g) => g.members.length);
  const inGroup = new Set(groups.flatMap((g) => g.members));
  const rows: { label: string; channels: number[]; icon: string }[] = [
    ...groups.map((g) => ({ label: g.name, channels: g.members, icon: '▦' })),
    ...Array.from({ length: CH_COUNT }, (_, n) => n + 1)
      .filter((c) => !inGroup.has(c) && String(client.get(chNamePath(c)) ?? ''))
      .map((c) => ({ label: String(client.get(chNamePath(c))), channels: [c], icon: iconFor(String(client.get(chNamePath(c)))) })),
  ];
  const SIZE: Record<Need, number> = { rien: 0, bas: 16, moyen: 26, fort: 38 };
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Une colonne par personne, une ligne par instrument. Touche une case pour faire grossir la bulle : rien → un peu → moyen → fort. Touche un nom en haut pour le renommer.</Text>
      {rows.length === 0 && <Text style={{ color: theme.text }}>Nomme d’abord ce qui est branché (étape 1).</Text>}
      <ScrollView horizontal>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ width: 150 }} />
            {people.map((p) => (
              <Pressable key={targetId(p.t)} onPress={() => p.t.kind === 'bus' && setRen({ n: p.t.n, v: p.name })} style={[styles.colHead, { borderColor: p.color, backgroundColor: theme.panel }]}>
                <Text style={{ fontSize: 18 }}>{p.t.kind === 'main' ? '👥' : '🎧'}</Text>
                <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 12 }}>{p.name}</Text>
              </Pressable>
            ))}
          </View>
          {rows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <View style={[styles.rowHead, { backgroundColor: theme.panel, borderColor: theme.line }]}>
                <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '800', fontSize: 13 }}>{r.icon} {r.label}</Text>
              </View>
              {people.map((p) => {
                const cur = currentNeed(client, p.t, r.channels);
                const next = NEED_ORDER[(NEED_ORDER.indexOf(cur) + 1) % NEED_ORDER.length];
                const sz = SIZE[cur];
                return (
                  <Pressable key={targetId(p.t)} onPress={() => applyNeed(client, p.t, r.channels, next)} accessibilityLabel={`${p.name} entend ${r.label} : ${cur}`} style={[styles.cell, { backgroundColor: cur === 'rien' ? theme.deep : theme.panel }]}>
                    {sz > 0 && <View style={{ width: sz, height: sz, borderRadius: sz / 2, backgroundColor: p.color }} />}
                    <Text style={{ position: 'absolute', bottom: 3, right: 6, color: theme.muted, fontSize: 9, fontWeight: '800' }}>{NEEDS.find((x) => x.id === cur)?.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {ren && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput autoFocus value={ren.v} onChangeText={(v) => setRen({ ...ren, v })} placeholder={`Qui écoute AUX ${ren.n} ?`} placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.accent, backgroundColor: theme.deep }]} />
          <Pressable onPress={() => { if (ren.v.trim()) client.set(busNamePath(ren.n), s(ren.v.trim().slice(0, 12))); setRen(null); }} style={[styles.small, { borderColor: theme.accent, height: 46 }]}>
            <Text style={{ color: '#FBBF24', fontWeight: '800' }}>OK</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------- 4. Ambiance : des images ----------
function StepAmbiance({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [done, setDone] = useState('');
  const opts: { id: string; title: string; sub: string; recipe: string | null; kind: 'reverb' | 'delay'; a: number; b: number; c: number }[] = [
    { id: 'seche', title: 'Sec', sub: 'Petite salle, bar, salle qui résonne déjà', recipe: null, kind: 'reverb', a: 0.05, b: 0.1, c: 0.4 },
    { id: 'salle', title: 'Un peu d’espace', sub: 'Une plaque légère sur les voix', recipe: 'voixpop', kind: 'reverb', a: 0.4, b: 0.5, c: 0.7 },
    { id: 'grande', title: 'Grand et doux', sub: 'Ballades, dehors : voix et guitares', recipe: 'ballade', kind: 'reverb', a: 0.75, b: 0.8, c: 0.5 },
  ];
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Choisis une ambiance : l’appli règle FX1 et l’envoie sur les voies reconnues (voix, guitares…).</Text>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {opts.map((o) => (
          <Pressable
            key={o.id}
            onPress={() => {
              if (o.recipe) applyRecipe(client, 1, RECIPES.find((x) => x.id === o.recipe)!, true);
              else client.set('/rtn/1/mix/on', i(0));
              setDone(o.id);
            }}
            style={[styles.card, { flexGrow: 1, flexBasis: 240, backgroundColor: theme.panel, borderColor: done === o.id ? theme.accent : theme.line, borderWidth: 2 }]}
          >
            <FxVisual kind={o.kind} color="#C084FC" a={o.a} b={o.b} c={o.c} width={230} height={70} bg={theme.meterBg} />
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{done === o.id ? '✓ ' : ''}{o.title}</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{o.sub}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => { applyRecipe(client, 2, RECIPES.find((x) => x.id === 'slap')!, true); setDone((d) => d + '+echo'); }} style={[styles.card, { flexGrow: 1, flexBasis: 240, backgroundColor: theme.panel, borderColor: done.includes('echo') ? theme.accent : theme.line, borderWidth: 2 }]}>
          <FxVisual kind="delay" color="#F59E0B" a={0.25} b={0.2} c={0.5} width={230} height={70} bg={theme.meterBg} />
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{done.includes('echo') ? '✓ ' : ''}+ Petit écho sur la voix</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Dans FX2 · se règle ensuite dans Effets (tap tempo)</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------- 5. Balance : les gros boutons de gain ----------
function StepBalance({ client, theme }: { client: XAirClient; theme: Theme }) {
  useEffect(() => {
    client.startMeters();
    client.loadPaths(Array.from({ length: CH_COUNT }, (_, k) => headampGainPath(k + 1)));
  }, [client]);
  const named = Array.from({ length: CH_COUNT }, (_, n) => n + 1).filter((c) => String(client.get(chNamePath(c)) ?? ''));
  const [auto, setAuto] = useState(false);
  const wide = useWindowDimensions().width >= 900;
  return (
    <View style={{ gap: 10 }}>
      <Pressable onPress={() => setAuto(true)} style={[styles.big, { borderColor: theme.ok, backgroundColor: '#13261E' }]}>
        <Text style={{ color: '#A7F3D0', fontWeight: '800', fontSize: 15 }}>🤖 Laisser l’appli faire : balance automatique</Text>
      </Pressable>
      <AutoBalanceScreen client={client} theme={theme} visible={auto} onClose={() => setAuto(false)} />
      <Text style={{ color: theme.muted, fontSize: 13 }}>Ou à la main : un musicien à la fois joue aussi fort qu’en concert. Tourne son bouton jusqu’à ce que la barre soit verte (« bon »).</Text>
      {named.length === 0 && <Text style={{ color: theme.text }}>Nomme d’abord ce qui est branché (étape 1).</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {named.map((c) => <GainTile key={c} client={client} ch={c} theme={theme} size={wide ? 90 : 70} onOpen={() => {}} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 50, paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  quit: { height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  small: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, justifyContent: 'center' },
  chip: { height: 42, paddingHorizontal: 14, borderRadius: 21, borderWidth: 1, justifyContent: 'center' },
  need: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  big: { height: 56, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  inst: { width: 92, height: 76, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  colHead: { width: 96, height: 60, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  rowHead: { width: 150, height: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, justifyContent: 'center' },
  cell: { width: 96, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nav: { flex: 1, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pm: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
