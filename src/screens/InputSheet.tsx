// Le tiroir d'une voie, ouvert par-dessus la table (appui sur une tranche).
// Le contenu est le tiroir commun : voir ChannelDrawer.
import React from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { readInset } from '../ui/immersive';
import { Theme } from '../ui/theme';
import { colorOf } from '../xair/smartName';
import { XAirClient } from '../xair/XAirClient';
import { ChannelDrawer, DrawerActions } from './ChannelDrawer';

export type InputActions = DrawerActions;

export function InputSheet({ client, ch, theme, onClose, actions }: { client: XAirClient; ch: number | null; theme: Theme; onClose: () => void; actions?: DrawerActions }) {
  const { height } = useWindowDimensions();
  // une action qui mène ailleurs (égaliseur, copie) ferme d'abord le tiroir
  const wrapped: DrawerActions | undefined = actions && {
    onDetail: actions.onDetail && ((c) => { onClose(); actions.onDetail!(c); }),
    onCopy: actions.onCopy && ((c) => { onClose(); actions.onCopy!(c); }),
  };
  const color = ch !== null ? colorOf(Number(client.get(`/ch/${String(ch).padStart(2, '0')}/config/color`) ?? 0)) : theme.line;
  return (
    <Modal visible={ch !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Fermer" />
        {ch !== null && (
          <View style={[styles.sheet, { backgroundColor: theme.panel, borderColor: color, height: Math.min(420, height * 0.6) + readInset(), paddingBottom: 14 + readInset() }]}>
            <ChannelDrawer client={client} theme={theme} ch={ch} actions={wrapped} onClose={onClose} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 2, borderLeftWidth: 2, borderRightWidth: 2, padding: 14, paddingBottom: 22 },
});
