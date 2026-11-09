// Mode guidé pour débutant : 5 étapes, une seule chose à la fois.
// 1 Ce qui est branché · 2 Groupes · 3 Ce que chacun veut entendre · 4 Ambiance · 5 Balance
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { i, s } from '../osc/osc';
import { save } from '../store/persist';
import { Theme } from '../ui/theme';
import { BUS_COUNT, busNamePath, CH_COUNT, chNamePath, headampGainPath, MAIN, meterIndex, phantomPath, Target, targetId } from '../xair/addresses';
import { applyRecipe, RECIPES } from '../xair/effects';
import { readGroups } from '../xair/groups';
import { applyNeed, currentNeed, gainAdvice, hasPreamp, INSTRUMENTS, NEEDS, nudgeGain } from '../xair/guide';
import { capture } from '../xair/snapshot';
import { applySmartName, recognize } from '../xair/smartName';
import { useMeter } from '../xair/useMeter';
import { useParam } from '../xair/useParam';
import { fToGainDb } from '../xair/addresses';
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

// ---------- 1. Ce qui est branché ----------
function StepPlugged({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [pick, setPick] = useState<number | null>(null);
  const choose = (ch: number, label: string) => {
    setPick(null);
    if (label === 'Rien') {
      client.set(chNamePath(ch), s(''));
      return;
    }
    const rec = recognize(label);
    applySmartName(client, ch, label, rec, { color: true, group: true, preset: true });
    if (rec?.phantom && hasPreamp(ch)) {
      Alert.alert('Micro statique ?', `${label} se prend souvent avec un micro qui a besoin du 48 V. Allumer le 48 V sur la prise ${ch} ?`, [
        { text: 'Non', style: 'cancel' },
        { text: 'Oui, allumer', onPress: () => client.set(phantomPath(ch), i(1)) },
      ]);
    }
  };
  return (
    <>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Pour chaque prise de la table, dis ce qui est branché. L’appli nomme la voie, choisit sa couleur, la range dans un groupe et pose un préréglage.</Text>
      {Array.from({ length: CH_COUNT }, (_, n) => n + 1).map((ch) => {
        const name = String(client.get(chNamePath(ch)) ?? '');
        return (
          <View key={ch} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: theme.muted, width: 58, fontWeight: '800' }}>Prise {ch}</Text>
              <Text style={{ color: name ? theme.text : theme.muted, flex: 1, fontSize: 15, fontWeight: '700' }}>{name || 'rien de branché'}</Text>
              <Pressable onPress={() => setPick(pick === ch ? null : ch)} style={[styles.small, { borderColor: theme.accent }]}>
                <Text style={{ color: '#FBBF24', fontWeight: '800' }}>{pick === ch ? 'Fermer' : 'Changer'}</Text>
              </Pressable>
            </View>
            {pick === ch && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[...INSTRUMENTS, 'Rien'].map((l) => (
                  <Pressable key={l} onPress={() => choose(ch, l)} style={[styles.small, { borderColor: theme.line2, backgroundColor: theme.deep }]}>
                    <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

// ---------- 2. Groupes ----------
function StepGroups({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [open, setOpen] = useState(false);
  const groups = readGroups(client).filter((g) => g.members.length);
  return (
    <>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Un groupe monte ou baisse plusieurs voies d’un coup (ex. toute la batterie), dans la façade comme dans les retours.</Text>
      {groups.length === 0 && <Text style={{ color: theme.text, fontSize: 14 }}>Aucun groupe pour l’instant.</Text>}
      {groups.map((g) => (
        <View key={g.k} style={[styles.card, { backgroundColor: theme.panel, borderColor: '#6B4E14' }]}>
          <Text style={{ color: '#FBBF24', fontSize: 16, fontWeight: '800' }}>{g.name}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{g.members.map((c) => String(client.get(chNamePath(c)) ?? '') || `Voie ${c}`).join(' · ')}</Text>
        </View>
      ))}
      <Pressable onPress={() => setOpen(true)} style={[styles.big, { borderColor: theme.accent }]}>
        <Text style={{ color: '#FBBF24', fontWeight: '800', fontSize: 15 }}>+ Créer ou modifier mes groupes</Text>
      </Pressable>
      <GroupsSheet client={client} theme={theme} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ---------- 3. Qui veut entendre quoi ----------
function StepNeeds({ client, theme }: { client: XAirClient; theme: Theme }) {
  const people: { t: Target; name: string }[] = [
    { t: MAIN, name: 'Le public' },
    ...Array.from({ length: BUS_COUNT }, (_, k) => ({ t: { kind: 'bus', n: k + 1 } as Target, name: String(client.get(busNamePath(k + 1)) ?? '') || `Retour ${k + 1}` })),
  ];
  const [who, setWho] = useState(1);
  const [rename, setRename] = useState('');
  const t = people[who].t;
  const groups = readGroups(client).filter((g) => g.members.length);
  const inGroup = new Set(groups.flatMap((g) => g.members));
  const rows: { label: string; channels: number[] }[] = [
    ...groups.map((g) => ({ label: `${g.name} (groupe)`, channels: g.members })),
    ...Array.from({ length: CH_COUNT }, (_, n) => n + 1)
      .filter((c) => !inGroup.has(c) && String(client.get(chNamePath(c)) ?? ''))
      .map((c) => ({ label: String(client.get(chNamePath(c))), channels: [c] })),
  ];
  return (
    <>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Choisis une personne, puis dis ce qu’elle veut entendre. Chaque retour sort sur sa prise AUX (casque ou retour de scène).</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {people.map((p, k) => (
          <Pressable key={targetId(p.t)} onPress={() => setWho(k)} style={[styles.chip, k === who ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
            <Text style={{ color: k === who ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{p.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {t.kind === 'bus' && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={rename} onChangeText={setRename} placeholder={`Qui écoute AUX ${t.n} ? (ex. Bassiste)`} placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.line2, backgroundColor: theme.deep }]} />
          <Pressable
            onPress={() => {
              if (!rename.trim()) return;
              client.set(busNamePath(t.n), s(rename.trim().slice(0, 12)));
              setRename('');
            }}
            style={[styles.small, { borderColor: theme.accent, height: 46 }]}
          >
            <Text style={{ color: '#FBBF24', fontWeight: '800' }}>Nommer</Text>
          </Pressable>
        </View>
      )}
      {rows.length === 0 && <Text style={{ color: theme.text }}>Nomme d’abord ce qui est branché (étape 1).</Text>}
      {rows.map((r) => {
        const cur = currentNeed(client, t, r.channels);
        return (
          <View key={r.label} style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{r.label}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {NEEDS.map((n) => (
                <Pressable key={n.id} onPress={() => applyNeed(client, t, r.channels, n.id)} accessibilityState={{ selected: cur === n.id }} style={[styles.need, cur === n.id ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.line2 }]}>
                  <Text style={{ color: cur === n.id ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 13 }}>{n.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </>
  );
}

// ---------- 4. Ambiance ----------
function StepAmbiance({ client, theme }: { client: XAirClient; theme: Theme }) {
  const [done, setDone] = useState('');
  const opts: { id: string; title: string; sub: string; recipe: string | null }[] = [
    { id: 'seche', title: 'Sec', sub: 'Petite salle, bar, salle qui résonne déjà', recipe: null },
    { id: 'salle', title: 'Un peu d’espace', sub: 'Salle moyenne : une plaque légère sur les voix', recipe: 'voixpop' },
    { id: 'grande', title: 'Grand et doux', sub: 'Ballades, dehors : grande salle sur voix et guitares', recipe: 'ballade' },
  ];
  return (
    <>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Les effets sont dans la table (4 emplacements). Choisis une ambiance : l’appli règle FX1 et les voies reconnues (Voix, Guitare…).</Text>
      {opts.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => {
            if (o.recipe) {
              const r = RECIPES.find((x) => x.id === o.recipe)!;
              applyRecipe(client, 1, r, true);
            } else client.set('/rtn/1/mix/on', i(0));
            setDone(o.id);
          }}
          style={[styles.card, { backgroundColor: theme.panel, borderColor: done === o.id ? theme.accent : theme.line }]}
        >
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>{o.title}</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{o.sub}</Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => {
          applyRecipe(client, 2, RECIPES.find((x) => x.id === 'slap')!, true);
          setDone((d) => d + '+echo');
        }}
        style={[styles.card, { backgroundColor: theme.panel, borderColor: done.includes('echo') ? theme.accent : theme.line }]}
      >
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800' }}>+ Un petit écho sur la voix</Text>
        <Text style={{ color: theme.muted, fontSize: 12 }}>Dans FX2 · se règle ensuite dans Outils › Effets (tap tempo)</Text>
      </Pressable>
    </>
  );
}

// ---------- 5. Balance ----------
function StepBalance({ client, theme }: { client: XAirClient; theme: Theme }) {
  useEffect(() => {
    client.startMeters();
    client.loadPaths(Array.from({ length: 8 }, (_, k) => headampGainPath(k + 1)));
  }, [client]);
  const named = Array.from({ length: CH_COUNT }, (_, n) => n + 1).filter((c) => String(client.get(chNamePath(c)) ?? ''));
  const [auto, setAuto] = useState(false);
  return (
    <>
      <Pressable onPress={() => setAuto(true)} style={[styles.big, { borderColor: theme.ok, backgroundColor: '#13261E' }]}>
        <Text style={{ color: '#A7F3D0', fontWeight: '800', fontSize: 15 }}>Laisser l’appli faire : balance automatique</Text>
      </Pressable>
      <AutoBalanceScreen client={client} theme={theme} visible={auto} onClose={() => setAuto(false)} />
      <Text style={{ color: theme.muted, fontSize: 12 }}>Ou à la main :</Text>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Un musicien à la fois joue AUSSI FORT qu’en concert. Règle le gain jusqu’à « Parfait ». Ensuite, tous ensemble : ajuste avec les faders.</Text>
      {named.length === 0 && <Text style={{ color: theme.text }}>Nomme d’abord ce qui est branché (étape 1).</Text>}
      {named.map((c) => (
        <BalanceRow key={c} client={client} ch={c} theme={theme} />
      ))}
    </>
  );
}

function BalanceRow({ client, ch, theme }: { client: XAirClient; ch: number; theme: Theme }) {
  const m = useMeter(client, [meterIndex.ch(ch)], 120);
  const gain = Number(useParam<number>(client, headampGainPath(ch), 0.5));
  const adv = gainAdvice(m.db);
  const color = adv.tone === 'ok' ? theme.ok : adv.tone === 'high' ? theme.mute : adv.tone === 'low' ? '#FCD34D' : theme.muted;
  const name = String(client.get(chNamePath(ch)) ?? '');
  return (
    <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', flex: 1 }}>
          {ch} · {name}
        </Text>
        <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{adv.text}</Text>
      </View>
      <View style={{ height: 12, borderRadius: 6, backgroundColor: theme.meterBg, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(m.level * 100)}%`, height: 12, backgroundColor: color }} />
      </View>
      {hasPreamp(ch) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => nudgeGain(client, ch, -3)} style={[styles.pm, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>Gain −</Text>
          </Pressable>
          <Text style={{ color: theme.text, width: 70, textAlign: 'center', fontWeight: '800' }}>{Math.round(fToGainDb(gain))} dB</Text>
          <Pressable onPress={() => nudgeGain(client, ch, 3)} style={[styles.pm, { borderColor: theme.line2 }]}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800' }}>Gain +</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={{ color: theme.muted, fontSize: 12 }}>Entrée ligne (pas de préampli) : règle le volume sur l’instrument ou la boîte de direct.</Text>
      )}
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
  nav: { flex: 1, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pm: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
