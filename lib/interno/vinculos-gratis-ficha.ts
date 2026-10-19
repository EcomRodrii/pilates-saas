import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MotivoVinculo, VinculoFicha } from '../billing/vinculos-gratis.ts';

export type { VinculoFicha };

interface Fila {
  studio_id: string; vinculado_id: string; motivo: MotivoVinculo; cuenta: boolean;
  detalle: { comunes?: number; total?: number } | null; detectado_en: string; descartado_en: string | null;
}

/** Los vínculos de un estudio, agrupados por el otro estudio. `[]` si la lectura falla. */
export async function vinculosDeLaFicha(db: SupabaseClient, id: string): Promise<VinculoFicha[]> {
  const columnas = 'studio_id, vinculado_id, motivo, cuenta, detalle, detectado_en, descartado_en';
  const [a, b] = await Promise.all([
    db.from('vinculos_cuentas_gratis').select(columnas).eq('studio_id', id),
    db.from('vinculos_cuentas_gratis').select(columnas).eq('vinculado_id', id),
  ]);
  if (a.error || b.error) return [];
  const filas = [...(a.data ?? []), ...(b.data ?? [])] as Fila[];
  if (filas.length === 0) return [];

  const porOtro = new Map<string, Fila[]>();
  for (const f of filas) {
    const otro = f.studio_id === id ? f.vinculado_id : f.studio_id;
    porOtro.set(otro, [...(porOtro.get(otro) ?? []), f]);
  }
  const { data: otros } = await db.from('studios').select('id, nombre, slug, subscription_status').in('id', [...porOtro.keys()]);
  const info = new Map(((otros ?? []) as { id: string; nombre: string | null; slug: string; subscription_status: string | null }[])
    .map(o => [o.id, o]));

  return [...porOtro.entries()].map(([otroId, fs]) => {
    const vivas = fs.filter(f => !f.descartado_en);
    const conAlumnas = fs.find(f => f.motivo === 'alumnas' && f.detalle?.comunes != null);
    return {
      otroId,
      otroNombre: info.get(otroId)?.nombre ?? info.get(otroId)?.slug ?? otroId,
      otroEstado: info.get(otroId)?.subscription_status ?? null,
      motivos: [...new Set(fs.map(f => f.motivo))],
      cuenta: vivas.some(f => f.cuenta),
      alumnas: conAlumnas ? { comunes: conAlumnas.detalle!.comunes!, total: conAlumnas.detalle!.total ?? 0 } : null,
      detectadoEn: fs.map(f => f.detectado_en).sort()[0],
      descartado: vivas.length === 0,
    };
  }).sort((x, y) => Number(y.cuenta) - Number(x.cuenta));
}
