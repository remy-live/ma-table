// Calcul du QR code (pur JavaScript, testable sans téléphone).
import qrcode from 'qrcode-generator';

export function qrMatrix(text: string): boolean[][] {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}
