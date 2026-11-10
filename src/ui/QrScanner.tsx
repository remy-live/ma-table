// Scanner le QR code d'invitation du sondier avec l'appareil photo.
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Theme } from './theme';

export function QrScanner({ theme, visible, onClose, onCode }: { theme: Theme; visible: boolean; onClose: () => void; onCode: (text: string) => void }) {
  const [perm, ask] = useCameraPermissions();
  const done = useRef(false);
  if (!visible) return null;
  done.current = false;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={[styles.root, { backgroundColor: '#000' }]}>
        {perm?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(r) => { if (done.current || !r.data) return; done.current = true; onCode(r.data); }}
          />
        ) : (
          <View style={{ alignItems: 'center', gap: 14, padding: 24 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' }}>L’appareil photo sert à lire le QR code du sondier</Text>
            <Pressable onPress={ask} style={[styles.btn, { backgroundColor: '#34D399' }]}><Text style={{ color: '#052E1F', fontWeight: '800', fontSize: 16 }}>Autoriser l’appareil photo</Text></Pressable>
            {perm && !perm.canAskAgain && <Text style={{ color: '#FCA5A5', textAlign: 'center' }}>Refusé : autorise-le dans les réglages du téléphone (Applis › Ma table › Autorisations).</Text>}
          </View>
        )}
        {perm?.granted && (
          <View pointerEvents="none" style={styles.frameWrap}>
            <View style={styles.frame} />
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 16, textShadowColor: '#000', textShadowRadius: 6 }}>Vise le QR code sur l’écran du sondier</Text>
          </View>
        )}
        <Pressable onPress={onClose} style={[styles.close, { borderColor: theme.line2 }]}><Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Fermer</Text></Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frameWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: 24, borderWidth: 4, borderColor: '#34D399' },
  btn: { height: 52, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', bottom: 40, height: 52, paddingHorizontal: 28, borderRadius: 26, borderWidth: 2, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
});
