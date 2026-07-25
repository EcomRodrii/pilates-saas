// ─────────────────────────────────────────────────────────────────────────────
// Panel interno — registro de auditoría (SERVER-ONLY).
//
// Qué se registra: todo lo que CAMBIA algo, y las lecturas de datos sensibles
// de un cliente (entrar en la ficha de un estudio, exportar sus datos). Lo que
// no se registra: navegar por los KPIs agregados de la propia Tentare.
//
// La tabla rechaza UPDATE y DELETE por trigger, así que esto solo puede añadir.
// Escribir aquí NUNCA debe tumbar la operación que se estaba auditando: si el
// log falla, se avisa por consola y se sigue. Es una decisión consciente —
// perder una línea de log es malo, dejar a medias un cambio de plan es peor.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import type { AdminInterno } from './auth.ts';

export interface EntradaAuditoria {
  actor: AdminInterno;
  // Jerárquica y en pasado: 'estudio.plan.cambiado', 'estudio.ficha.abierta'.
  accion: string;
  objetivoTipo?: string;
  objetivoId?: string;
  // Legible por una persona seis meses después: "Business → Enterprise".
  resumen: string;
  antes?: unknown;
  despues?: unknown;
}

// La IP real detrás del proxy de Vercel. x-forwarded-for puede traer una cadena
// de saltos; el cliente es el primero.
function ipDe(req: NextRequest): string | null {
  const cadena = req.headers.get('x-forwarded-for');
  if (cadena) return cadena.split(',')[0]!.trim();
  return req.headers.get('x-real-ip');
}

export async function registrar(
  db: SupabaseClient, req: NextRequest, entrada: EntradaAuditoria,
): Promise<void> {
  try {
    const { error } = await db.from('plataforma_auditoria').insert({
      actor_auth_user_id: entrada.actor.userId,
      actor_nombre: entrada.actor.nombre,
      accion: entrada.accion,
      objetivo_tipo: entrada.objetivoTipo ?? null,
      objetivo_id: entrada.objetivoId ?? null,
      resumen: entrada.resumen,
      antes: entrada.antes ?? null,
      despues: entrada.despues ?? null,
      ip: ipDe(req),
      user_agent: req.headers.get('user-agent'),
    });
    if (error) console.error('[auditoría] no se pudo registrar:', error.message, entrada.accion);
  } catch (e) {
    console.error('[auditoría] no se pudo registrar:', e instanceof Error ? e.message : e);
  }
}
