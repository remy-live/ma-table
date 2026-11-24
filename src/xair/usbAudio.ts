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

export interface RecSummary { id: string; dir: string; frames: number; seconds: number; rate: number; channels: number; bits: number; peakDb: number[]; rmsDb: number[]; clips: number[]; usbErrors: number; writeErrors: number; lastErrno: number; holes: number; maxGapMs: number; emptyPackets: number; files: string[]; reason: string }
export interface RecEvent { t?: number; peaks?: number[]; clips?: number[]; usbErrors?: number; writeErrors?: number; alive?: boolean; free?: number; ended?: boolean; summary?: RecSummary; error?: string }
export interface SessFile { name: string; path: string; size: number }
export interface SessEntry { id: string; dir: string; public: boolean; modified: number; meta: string; files: SessFile[] }
export interface MixResult { ok: boolean; error?: string; path?: string; gains?: (number | null)[]; peakDb?: number; seconds?: number }

export interface EngineParams { gains: number[]; pans: number[]; master: number; kept: number[]; regs: { a: number; b: number; g: number; k: number }[]; fades: { a: number; b: number; rising: boolean }[]; hp?: number[]; thr?: number[]; slope?: number[]; makeup?: number[]; gate?: number[]; eq?: boolean; glue?: boolean; limit?: boolean; teq?: number[][]; rev?: number[]; key?: number[]; duck?: number[]; duckThr?: number; duckGain?: number }

export type Native = {
  recStart(o: { name: string; tracks: { file: string; a: number; b: number }[] }): Promise<{ ok: boolean; error: string; id?: string; dir?: string; public?: boolean; channels?: number; bits?: number; rate?: number; files?: string[] }>;
  recStop(): Promise<RecSummary | null>;
  recState(): { on: boolean; id: string; dir: string };
  recFree(): { free: number; public: boolean };
  sessList(): SessEntry[];
  metaSave(id: string, json: string): boolean;
  sessDelete(id: string): boolean;
  sessRename(id: string, name: string): string;
  fileDelete(path: string): boolean;
  mix(o: { tracks: { path: string; trim: number; pan: number; auto: boolean }[]; out: string; from?: number; to?: number }): Promise<MixResult>;
  mixCancel(): void;
  peaks(path: string): Promise<{ ok: boolean; error?: string; data?: string; bucket?: number; seconds?: number; channels?: number }>;
  analyze(path: string): Promise<{ ok: boolean; error?: string; json?: string }>;
  mixMeasure(o: EngineParams & { paths: string[]; from?: number; to?: number }): Promise<{ ok: boolean; error?: string; rmsDb?: number; peakDb?: number }>;
  playerOpen(paths: string[]): { ok: boolean; error?: string; rate?: number; seconds?: number };
  playerSet(o: EngineParams): boolean;
  playerPlay(on: boolean): boolean;
  playerSeek(sec: number): boolean;
  playerClose(): boolean;
  mixExport(o: EngineParams & { paths: string[]; out: string; from?: number; to?: number }): Promise<MixResult>;
  /** plusieurs morceaux à la suite : un fichier par morceau (out) et/ou un seul fichier (full) */
  mixAlbum(o: { songs: (EngineParams & { paths: string[]; out?: string; from: number; to: number })[]; full?: string; gap?: number }): Promise<MixResult>;
  albumDir(name: string): string;
  /** tout un enregistrement (pistes + notes) dans un seul fichier à envoyer */
  sessPack(o: { paths: string[]; notes: string; name: string; from?: number; to?: number }): Promise<{ ok: boolean; error?: string; path?: string; size?: number }>;
  sessImport(path: string, name: string): Promise<{ ok: boolean; error?: string; id?: string }>;
  playAt(path: string, ms: number): boolean;
  share(path: string): Promise<boolean>;
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
  addListener(ev: 'onRec', cb: (e: RecEvent) => void): { remove(): void };
  addListener(ev: 'onMix', cb: (e: { p: number; peaks?: string }) => void): { remove(): void };
  addListener(ev: 'onPlay', cb: (e: { t: number; playing: boolean; ended: boolean }) => void): { remove(): void };
};

export const usbAudio: Native | null = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('UsbAudio') : null;

/** Ce dont l'enregistreur et l'écran d'écoute ont besoin. Sur le web (démo) : un faux concert, pour essayer l'écran. */
export type ListenNative = Pick<Native, 'recStart' | 'recStop' | 'recFree' | 'sessList' | 'metaSave' | 'sessDelete' | 'sessRename' | 'fileDelete' | 'share' | 'peaks' | 'analyze' | 'mixMeasure' | 'playerOpen' | 'playerSet' | 'playerPlay' | 'playerSeek' | 'playerClose' | 'mixExport' | 'mixAlbum' | 'albumDir' | 'sessPack' | 'sessImport' | 'mixCancel' | 'addListener'>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const usbListen: ListenNative | null = usbAudio ?? (Platform.OS === 'web' ? (require('./usbAudioDemo') as { demoUsb: ListenNative }).demoUsb : null);

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
