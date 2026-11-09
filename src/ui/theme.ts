// Thèmes de l'appli. Tout l'écran lit ses couleurs ici : ajouter un thème =
// ajouter une entrée (plus tard : importer un fichier JSON de même forme).

export interface Theme {
  name: string;
  bg: string;
  panel: string;
  deep: string;
  line: string;
  line2: string;
  text: string;
  muted: string;
  track: string;
  cap: string;
  capGroove: string;
  meterBg: string;
  accent: string;
  onAccent: string;
  mute: string;
  onMute: string;
  ok: string;
}

export const THEMES: Record<string, Theme> = {
  nuit: {
    name: 'Nuit', bg: '#111418', panel: '#181C21', deep: '#0E1114', line: '#2A3038', line2: '#3A424C',
    text: '#E8EAED', muted: '#9AA3AD', track: '#262B32', cap: '#D9DDE2', capGroove: '#8A939C',
    meterBg: '#0B0D10', accent: '#F59E0B', onAccent: '#1A1204', mute: '#EF4444', onMute: '#1A0505', ok: '#34D399',
  },
  ambre: {
    name: 'Scène ambre', bg: '#14100A', panel: '#1E1810', deep: '#0F0C07', line: '#3A2E1A', line2: '#5A4826',
    text: '#F5EBDD', muted: '#B8A68A', track: '#33291A', cap: '#E9DCC6', capGroove: '#9C8A6C',
    meterBg: '#0A0804', accent: '#F59E0B', onAccent: '#140E05', mute: '#EF4444', onMute: '#1A0505', ok: '#5EE0A8',
  },
  jour: {
    name: 'Plein jour', bg: '#EEF0F3', panel: '#FFFFFF', deep: '#E2E6EA', line: '#D3D8DE', line2: '#A9B1BA',
    text: '#111418', muted: '#4B5563', track: '#D3D8DE', cap: '#2B3138', capGroove: '#8A939C',
    meterBg: '#1F2937', accent: '#B45309', onAccent: '#FFFFFF', mute: '#DC2626', onMute: '#FFFFFF', ok: '#047857',
  },
};

export const THEME_ORDER = ['nuit', 'ambre', 'jour'];
