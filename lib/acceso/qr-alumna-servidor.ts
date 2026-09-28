// El QR permanente de una alumna: dárselo y cambiarlo.
//
// Una fila activa por alumna en `socios_qr_acceso` (índice único parcial). El
// token no se guarda: sale de `tokenQrDeFila(id)` cada vez (ver qr-token.ts).
// Service-role: la tabla no tiene ningún grant para el cliente.

import type { SupabaseClient } from '@supabase/supabase-js';
import { hashTokenQr, nuevoIdQr, tokenQrDeFila } from './qr-token.ts';

type Quien = { studioId: string; socioId: string };
export type RevocadoPor = 'ALUMNA' | 'ESTUDIO' | 'SISTEMA';

const YA_EXISTIA = '23505';

async function revocar(admin: SupabaseClient, q: Quien, por: RevocadoPor, soloId?: string): Promise<void> {
  let consulta = admin.from('socios_qr_acceso')
    .update({ revocado_en: new Date().toISOString(), revocado_por: por })
    .eq('studio_id', q.studioId).eq('socio_id', q.socioId).is('revocado_en', null);
  if (soloId) consulta = consulta.eq('id', soloId);
  const { error } = await consulta;
  if (error) throw error;
}

/**
 * Su QR. Si no tiene, se crea; si el que tiene ya no cuadra con su hash (cambió
 * el secreto), se revoca y se crea otro — la alumna ve el nuevo sin hacer nada.
 */
export async function qrDeLaAlumna(admin: SupabaseClient, q: Quien, intento = 0): Promise<{ token: string; creadoEn: string }> {
  const { data: fila, error } = await admin.from('socios_qr_acceso')
    .select('id, token_hash, creado_en')
    .eq('studio_id', q.studioId).eq('socio_id', q.socioId).is('revocado_en', null)
    .maybeSingle();
  if (error) throw error;

  if (fila) {
    const token = tokenQrDeFila(fila.id as string);
    if (hashTokenQr(token) === fila.token_hash) return { token, creadoEn: fila.creado_en as string };
    // No cuadra: cambió el secreto. Solo producción lo renueva sola. Un entorno
    // que comparta la base de datos con otro secreto (una preview mal
    // configurada) revocaría en silencio el QR real de cada alumna que lo
    // abriera, y los dos entornos se lo irían quitando el uno al otro.
    if (process.env.VERCEL_ENV !== 'production') {
      throw new Error('qr-acceso: el secreto de este entorno no es el que firmó los QR guardados');
    }
    await revocar(admin, q, 'SISTEMA', fila.id as string);
  }

  const id = nuevoIdQr();
  const token = tokenQrDeFila(id);
  const { data: nueva, error: eIns } = await admin.from('socios_qr_acceso')
    .insert({ id, studio_id: q.studioId, socio_id: q.socioId, token_hash: hashTokenQr(token) })
    .select('creado_en').single();
  if (eIns) {
    // Dos pestañas a la vez: la otra ganó el índice único. Se relee la suya.
    if (eIns.code === YA_EXISTIA && intento === 0) return qrDeLaAlumna(admin, q, 1);
    throw eIns;
  }
  return { token, creadoEn: nueva.creado_en as string };
}

/** Cambia su QR: el anterior deja de valer en el acto («QR sustituido» al leerlo). */
export async function regenerarQr(admin: SupabaseClient, q: Quien, por: Exclude<RevocadoPor, 'SISTEMA'>): Promise<{ token: string; creadoEn: string }> {
  await revocar(admin, q, por);
  return qrDeLaAlumna(admin, q);
}
