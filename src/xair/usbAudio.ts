// Enregistrement par la prise USB de la table (Android). Le module natif teste ce
// que la tablette accepte : appareils vus, nombre de voies, enregistrement court.
import { requireOptionalNativeModule } from 'expo';
import { PermissionsAndroid, Platform } from 'react-native';

export interface UsbInput { id: number; type: string; product: string; address: string; channelCounts: number[]; indexMasks: number[]; sampleRates: number[]; encodings: number[] }
export interface UsbHostDevice { name: string; vendor: number; productId: number; product: string; maker: string; interfaces: { id: number; alt: number; cls: number; sub: number; proto: number; eps: { addr: number; in: boolean; type: number; max: number }[] }[] }
export interface ProbeOpts { deviceId: number; ch: number; float: boolean; rate: number; src: number; positional: boolean }
export interface ProbeResult { ok: boolean; error: string; frames?: number; routed?: string; channels?: number; rate?: number; peakDb?: number }
export interface DirectProbe { ok: boolean; error: string; product?: string; ifNum?: number; alt?: number; ep?: number; maxPacket?: number; channels?: number; subslot?: number; bits?: number; uac?: number; rate?: number; frames?: number; expected?: number; pktErrors?: number; urbErrors?: number; empty?: number; reaped?: number; odd?: number; submitErrors?: number; lastErrno?: number; peakDb?: number[] }
export interface RecordResult { bits?: number; dir: string; files: string[]; frames: number; expected: number; seconds: number; rate: number; channels: number; routed: string; shortReads: number; readErrors: number; peakDb: number[]; rmsDb: number[]; clips: number[] }

type Native = {
  info(): { model: string; maker: string; android: string; sdk: number; outRate: string; dir: string };
  devices(): UsbInput[];
  usbHost(): UsbHostDevice[];
  probe(o: ProbeOpts): Promise<ProbeResult>;
  record(o: ProbeOpts & { seconds: number }): Promise<RecordResult>;
  stop(): void;
  directProbe(): Promise<DirectProbe>;
  directRecord(o: { seconds: number }): Promise<RecordResult>;
  play(path: string): boolean;
  stopPlay(): void;
  clear(): boolean;
  addListener(ev: 'onLevels', cb: (e: { peaks: number[]; t: number }) => void): { remove(): void };
};

export const usbAudio: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('UsbAudio') : null;

/** Sources Android : 1 = micro (le plus sûr pour l'USB), 9 = non traité (sans correction automatique). */
export const SRC_MIC = 1;
export const SRC_UNPROCESSED = 9;

export async function askMic(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Enregistrer la table',
    message: 'Pour enregistrer le son qui arrive de la table par le câble USB.',
    buttonPositive: 'OK',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export const isUsb = (d: UsbInput) => d.type.startsWith('usb');
/** Le nombre de voies à essayer, du plus grand au plus petit. */
export const TRY_CHANNELS = [18, 16, 12, 10, 8, 6, 4, 2];
