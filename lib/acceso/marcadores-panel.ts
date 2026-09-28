import { checkinPublico } from '@/lib/db/supabase-data-admin';
import { abrirPuertaDelEstudio, tieneKisi } from '@/lib/kisi-servidor';
import type { Marcadores } from '@/lib/acceso/escanear-servidor';

// Cómo actúa el PANEL tras un 🟢: marca con `checkinPublico` (el check-in de
// siempre: ASISTIDA + créditos + referido + racha, idempotente). La puerta de
// Kisi, si el estudio la tiene, NO se abre sola: se ofrece un botón y la abre
// quien está mirando (decisión del fundador, 28-sep).
export function marcadoresDelPanel(studioId: string): Marcadores {
  return {
    async marcar(reservaId) {
      const r = await checkinPublico({ studioId, reservaId });
      return 'error' in r ? { ok: false, error: r.error ?? 'No se ha podido registrar la asistencia.' } : { ok: true };
    },
    tienePuerta() {
      return tieneKisi(studioId);
    },
    async abrirPuerta() {
      const p = await abrirPuertaDelEstudio(studioId);
      if (!p.ok) console.error('[acceso] kisi', p.error);
      return p.ok ? 'abierta' : 'fallo';
    },
  };
}
