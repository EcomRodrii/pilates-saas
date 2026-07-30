import { dbGetIntegracionConfig } from '@/lib/db/supabase-data-admin';
import { abrirPuertaKisi, listarCerradurasKisi } from '@/lib/kisi';

// Abrir la puerta de UN estudio, resolviendo su cerradura.
//
// Vivía dentro de `app/api/integrations/kisi/abrir`. Se saca aquí porque ahora
// hay dos caminos que abren la puerta —el check-in de recepción y el pase de la
// clienta— y la parte delicada es la misma en los dos: con varias cerraduras en
// la cuenta, "abrir la primera" es abrir una puerta cualquiera, y eso no se
// puede reimplementar dos veces esperando que ambas copias sigan de acuerdo.

export type ResultadoPuerta =
  | { ok: true }
  | { ok: false; error: string; status: 400 | 502 };

export async function abrirPuertaDelEstudio(studioId: string): Promise<ResultadoPuerta> {
  const intg = await dbGetIntegracionConfig(studioId, 'KISI');
  const apiKey = intg?.config.apiKey?.trim();
  if (!apiKey) return { ok: false, error: 'Kisi no está configurado', status: 400 };

  let lockId = intg?.config.lockId?.trim();
  if (!lockId) {
    const r = await listarCerradurasKisi({ apiKey });
    if (!r.ok) return { ok: false, error: r.error, status: 502 };
    if (r.locks.length === 0) {
      return { ok: false, error: 'Tu cuenta de Kisi no tiene ninguna cerradura', status: 400 };
    }
    if (r.locks.length > 1) {
      return {
        ok: false,
        error: 'Tienes varias cerraduras en Kisi: indica el ID de la puerta del estudio en Configuración → Integraciones → Kisi',
        status: 400,
      };
    }
    lockId = String(r.locks[0].id);
  }

  const r = await abrirPuertaKisi({ apiKey }, lockId);
  return r.ok ? { ok: true } : { ok: false, error: r.error, status: 502 };
}

/** ¿Este estudio tiene Kisi conectado? Para no intentar abrir lo que no existe. */
export async function tieneKisi(studioId: string): Promise<boolean> {
  const intg = await dbGetIntegracionConfig(studioId, 'KISI');
  return !!intg?.config.apiKey?.trim();
}
