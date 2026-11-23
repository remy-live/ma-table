// « Aide-moi » : les assistants, à part du reste pour ne pas encombrer.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CloseX } from '../ui/kit';
import { useLevel } from '../ui/words';
import { LexiconSheet } from './LexiconSheet';
import { Theme } from '../ui/theme';
import { XAirClient } from '../xair/XAirClient';
import { AutoBalanceScreen } from './AutoBalanceScreen';
import { ChecklistSheet } from './ConcertExtras';
import { GuideScreen } from './GuideScreen';
import { MagicWand } from './MagicWand';
import { ChangesSheet } from './ChangesSheet';
import { ReorderSheet } from './ReorderSheet';
import { TourSheet } from './TourSheet';
import { EffectsAdvisor } from './EffectsAdvisor';
import { VenueQuick } from './VenueQuick';
import { Tutorial } from './Tutorial';
import { TableCheckSheet } from './TableCheckSheet';

type Which = 'magie' | 'auto' | 'guide' | 'check' | 'tuto' | 'verif' | 'change' | 'ranger' | 'visite' | 'effets' | 'salle' | 'mots' | null;
type Group = 'installe' | 'comprends' | 'souci';

const GROUPS: { id: Group; icon: string; title: string; sub: string; color: string; items: [Exclude<Which, null>, string, string][] }[] = [
  { id: 'installe', icon: '🎬', title: 'Je m’installe', sub: 'Dans l’ordre : brancher, régler les niveaux, les effets, vérifier', color: '#22C55E', items: [
    ['magie', '① Qui branche quoi 🪄', 'Qui joue quoi, qui veut un retour : l’appli range prises et retours'],
    ['auto', '② Balance automatique 🎚', 'Chacun son tour, puis tous ensemble : l’appli règle les niveaux'],
    ['effets', '③ Proposer des effets ✨', 'Réverbe et écho conseillés, à écouter avant de garder'],
    ['check', '④ Avant le concert ✅', 'La check-list : connexion, noms, retours, sauvegarde'],
    ['salle', '🏠 Autre salle, mêmes musiciens', 'Reprendre une salle déjà faite et l’ajuster en une minute'],
    ['ranger', '🔀 Réorganiser les voies', 'Voix d’abord, batterie à la fin… sans toucher aux câbles'],
    ['guide', '👣 Tout faire à la main, pas à pas', 'Nommer, grouper, relier les retours soi-même, étape par étape'],
  ] },
  { id: 'comprends', icon: '💡', title: 'Je comprends', sub: 'À quoi sert chaque chose, et les mots de la table', color: '#60A5FA', items: [
    ['visite', '🧭 Visite de la table', 'Prises, public, retours, effets : avec tes vrais noms'],
    ['mots', '📖 Les mots de la table', 'Le mot simple et le mot technique, côte à côte'],
    ['tuto', '👆 Les gestes en 30 s', 'Glisser, rester appuyé, choisir qui écoute'],
  ] },
  { id: 'souci', icon: '🛟', title: 'J’ai un souci', sub: 'Vérifier, retrouver un micro, revenir en arrière', color: '#F59E0B', items: [
    ['change', '👀 Ce qui a changé', 'Ce que l’appli a réglé, sur le dessin de la table · annuler'],
    ['verif', '🔧 Vérifier ma table', 'L’appli essaie chaque fonction et dit ce qui marche'],
  ] },
];

export function HelpSheet({ client, theme, visible, onClose, onSeeWiring }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; onSeeWiring?: () => void }) {
  const [which, setWhich] = useState<Which>(null);
  const [open, setOpen] = useState<Group | null>(null);
  const big = useLevel().big;
  useEffect(() => { if (!visible) setOpen(null); }, [visible]);
  const g = GROUPS.find((x) => x.id === open);
  return (
    <>
      <Modal visible={visible && which === null} transparent animationType="fade" onRequestClose={() => (open ? setOpen(null) : onClose())}>
        <Pressable style={styles.back} onPress={() => { setOpen(null); onClose(); }}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {g && <Pressable onPress={() => setOpen(null)} accessibilityLabel="Retour" style={[styles.backBtn, { borderColor: theme.line2 }]}><Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>‹</Text></Pressable>}
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: big ? 26 : 22, fontWeight: '800' }}>{g ? `${g.icon} ${g.title}` : 'Aide-moi'}</Text>
                <Text style={{ color: theme.muted, fontSize: big ? 15 : 13 }}>{g ? g.sub : 'Dis-moi où tu en es.'}</Text>
              </View>
              <CloseX theme={theme} onPress={() => { setOpen(null); onClose(); }} />
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 10 }}>
              {!g && GROUPS.map((x) => (
                <Pressable key={x.id} onPress={() => setOpen(x.id)} accessibilityLabel={x.title} style={[styles.card, { backgroundColor: theme.deep, borderColor: x.color }]}>
                  <Text style={{ fontSize: 34 }}>{x.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: big ? 23 : 20, fontWeight: '800' }}>{x.title}</Text>
                    <Text style={{ color: theme.muted, fontSize: big ? 15 : 13 }}>{x.sub}</Text>
                  </View>
                  <Text style={{ color: x.color, fontSize: 26 }}>›</Text>
                </Pressable>
              ))}
              {g && g.items.map(([id, t, sub]) => (
                <Pressable key={id} onPress={() => setWhich(id)} style={[styles.item, { backgroundColor: theme.deep, borderColor: theme.line2 }]}>
                  <View style={{ width: 6, alignSelf: 'stretch', borderRadius: 3, backgroundColor: g.color }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: big ? 19 : 17, fontWeight: '800' }}>{t}</Text>
                    <Text style={{ color: theme.muted, fontSize: big ? 14 : 12 }}>{sub}</Text>
                  </View>
                  <Text style={{ color: g.color, fontSize: 22 }}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <LexiconSheet theme={theme} visible={visible && which === 'mots'} onClose={() => setWhich(null)} />
      <MagicWand client={client} theme={theme} visible={visible && which === 'magie'} onClose={() => { setWhich(null); onClose(); }} onSeeWiring={onSeeWiring} />
      <AutoBalanceScreen client={client} theme={theme} visible={visible && which === 'auto'} onClose={() => { setWhich(null); onClose(); }} />
      <GuideScreen client={client} theme={theme} visible={visible && which === 'guide'} onClose={() => { setWhich(null); onClose(); }} />
      <ChecklistSheet client={client} theme={theme} visible={visible && which === 'check'} onClose={() => { setWhich(null); onClose(); }} />
      <TableCheckSheet client={client} theme={theme} visible={visible && which === 'verif'} onClose={() => { setWhich(null); onClose(); }} />
      <ReorderSheet client={client} theme={theme} visible={visible && which === 'ranger'} onClose={() => { setWhich(null); onClose(); }} />
      <TourSheet client={client} theme={theme} visible={visible && which === 'visite'} onClose={() => { setWhich(null); onClose(); }} />
      <EffectsAdvisor client={client} theme={theme} visible={visible && which === 'effets'} onClose={() => { setWhich(null); onClose(); }} />
      <VenueQuick client={client} theme={theme} visible={visible && which === 'salle'} onClose={() => { setWhich(null); onClose(); }} />
      <ChangesSheet client={client} theme={theme} visible={visible && which === 'change'} onClose={() => { setWhich(null); onClose(); }} />
      <Tutorial theme={theme} visible={visible && which === 'tuto'} onClose={() => { setWhich(null); onClose(); }} />
    </>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center', maxHeight: '92%' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderRadius: 18, padding: 16, minHeight: 96 },
  backBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, minHeight: 76 },
});
