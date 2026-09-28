import type { Page } from '@playwright/test';
import { qrSvgMarkup } from '../lib/qr-svg';

// Una cámara que «enseña» un QR de verdad, para probar el lector de punta a punta
// sin hardware: `getUserMedia` devuelve el stream de un canvas donde se pinta el
// QR con el mismo generador que usa la app de la alumna (lib/qr-svg.ts). Lo lee
// el lector real (`components/acceso/lector-qr.tsx`): BarcodeDetector donde
// existe y jsQR donde no — en el Chromium de CI (Linux) no existe, así que ahí
// se prueba el camino de jsQR, que es el que usan los iPad.
//
// Registrar ANTES de navegar: es un init script.
export async function camaraQueEnsena(page: Page, texto: string) {
  const svg = qrSvgMarkup(texto);
  await page.addInitScript((marcado: string) => {
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(marcado)))}`;
    navigator.mediaDevices.getUserMedia = async () => {
      const lienzo = document.createElement('canvas');
      lienzo.width = 640;
      lienzo.height = 640;
      const ctx = lienzo.getContext('2d')!;
      const pintar = () => {
        ctx.fillStyle = '#d9d4cc';
        ctx.fillRect(0, 0, 640, 640);
        ctx.fillStyle = '#fff';
        ctx.fillRect(150, 150, 340, 340);
        if (img.complete) ctx.drawImage(img, 170, 170, 300, 300);
        requestAnimationFrame(pintar);
      };
      pintar();
      return lienzo.captureStream(15);
    };
  }, svg);
}

/** Un QR de acceso con la forma real (`TNT1-` + 22). Opaco: no es de nadie. */
export const QR_E2E = 'TNT1-e2eQrDeAccesoDePrueba1';
