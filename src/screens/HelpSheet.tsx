// « Aide-moi » : les assistants, à part du reste pour ne pas encombrer.
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from '../ui/theme';
import { XAirClient } from '../xair/XAirClient';
import { AutoBalanceScreen } from './AutoBalanceScreen';
import { ChecklistSheet } from './ConcertExtras';
import { GuideScreen } from './GuideScreen';
import { MagicWand } from './MagicWand';
import { Tutorial } from './Tutorial';
import { TableCheckSheet } from './TableCheckSheet';

type Which = 'magie' | 'auto' | 'guide' | 'check' | 'tuto' | 'verif' | null;

const ITEMS: [Exclude<Which, null>, string, string, string][] = [
  ['magie', '🪄 Qui branche quoi', 'Combien vous êtes, qui joue quoi, qui veut un retour : l’appli range prises et retours', '#E879F9'],
  ['auto', 'Balance automatique', 'Chacun son tour, puis tous ensemble : l’appli règle gains, faders et retours', '#22C55E'],
  ['guide', 'Mode guidé', 'Installer un concert pas à pas : ce qui est branché, groupes, retours, ambiance', '#60A5FA'],
  ['check', 'Avant le concert', 'La check-list : connexion, noms, retours, balance, sauvegarde', '#F59E0B'],
  ['verif', 'Vérifier ma table', 'L’appli essaie chaque fonction sur ta table et te dit ce qui marche', '#F87171'],
  ['tuto', 'Les gestes en 30 s', 'Glisser, rester appuyé, choisir qui écoute, les bulles', '#A78BFA'],
];

export function HelpSheet({ client, theme, visible, onClose, onSeeWiring }: { client: XAirClient; theme: Theme; visible: boolean; onClose: () => void; onSeeWiring?: () => void }) {
  const [which, setWhich] = useState<Which>(null);
  return (
    <>
      <Modal visible={visible && which === null} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.back} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.line }]} onPress={() => {}}>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>Aide-moi</Text>
            <Text style={{ color: theme.muted, fontSize: 13 }}>Les assistants qui font le travail avec toi.</Text>
            {ITEMS.map(([id, t, sub, c]) => (
              <Pressable key={id} onPress={() => setWhich(id)} style={[styles.item, { backgroundColor: theme.deep, borderColor: c }]}>
                <View style={{ width: 8, alignSelf: 'stretch', borderRadius: 4, backgroundColor: c }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 17, fontWeight: '800' }}>{t}</Text>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>{sub}</Text>
                </View>
                <Text style={{ color: c, fontSize: 22 }}>›</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      <MagicWand client={client} theme={theme} visible={visible && which === 'magie'} onClose={() => { setWhich(null); onClose(); }} onSeeWiring={onSeeWiring} />
      <AutoBalanceScreen client={client} theme={theme} visible={visible && which === 'auto'} onClose={() => { setWhich(null); onClose(); }} />
      <GuideScreen client={client} theme={theme} visible={visible && which === 'guide'} onClose={() => { setWhich(null); onClose(); }} />
      <ChecklistSheet client={client} theme={theme} visible={visible && which === 'check'} onClose={() => { setWhich(null); onClose(); }} />
      <TableCheckSheet client={client} theme={theme} visible={visible && which === 'verif'} onClose={() => { setWhich(null); onClose(); }} />
      <Tutorial theme={theme} visible={visible && which === 'tuto'} onClose={() => { setWhich(null); onClose(); }} />
    </>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 22, borderWidth: 1, padding: 18, gap: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 14, minHeight: 76 },
});
