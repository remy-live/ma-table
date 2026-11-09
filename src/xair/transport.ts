// Interface réseau commune : UDP natif sur téléphone (react-native-udp),
// dgram sous Node (simulateur, tests), ou mémoire pure (tests sans réseau).

export interface Remote {
  address: string;
  port: number;
}

export interface Transport {
  open(onMessage: (bytes: Uint8Array, from: Remote) => void): Promise<void>;
  send(bytes: Uint8Array, host: string, port: number): void;
  /** Active l'envoi en diffusion (recherche de la table sur le réseau). */
  setBroadcast?(on: boolean): void;
  close(): void;
}
