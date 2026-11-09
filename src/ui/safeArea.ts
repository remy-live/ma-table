// Marge en bas pour les boutons de navigation de la tablette (barre Android par-dessus l'appli).
import { Platform } from 'react-native';
export const BOTTOM_INSET = Platform.OS === 'android' ? 40 : 24;
