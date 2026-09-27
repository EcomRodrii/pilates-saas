import { portalAuthHeader } from '@/lib/api-client';

// El QR de acceso de la alumna, desde su app. Permanente: no caduca ni depende
// de ninguna reserva, así que se pide una vez por pantalla y no hay que
// refrescarlo. Enseñarlo no marca nada: decide el estudio al escanearlo.

export type QrAcceso = { activo: false } | { activo: true; qr: string; creadoEn: string };

export async function getQrAcceso(slug: string, opciones?: { regenerar?: boolean }): Promise<QrAcceso | null> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/qr-acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ slug, regenerar: opciones?.regenerar === true }),
    });
    if (!res.ok) return null;
    return (await res.json()) as QrAcceso;
  } catch {
    return null;
  }
}
