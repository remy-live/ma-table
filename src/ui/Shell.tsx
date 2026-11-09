// Un écran qui s'affiche soit en plein écran par-dessus (Modal), soit
// directement dans une section de la navigation (embedded).
import React from 'react';
import { Modal } from 'react-native';

export function Shell(props: { embedded?: boolean; visible: boolean; onClose: () => void; children: React.ReactNode }) {
  if (props.embedded) return <>{props.children}</>;
  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      {props.children}
    </Modal>
  );
}
