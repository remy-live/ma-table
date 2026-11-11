// Bluetooth (téléphone) : la bibliothèque react-native-ble-plx.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const makeBleManager = (): any => { const { BleManager } = require('react-native-ble-plx'); return new BleManager(); };
