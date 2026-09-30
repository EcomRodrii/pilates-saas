// Veri*Factu — ¿puede Tentare transmitir los registros de ESTE estudio?
//
// SOLO SERVIDOR. Es el bloqueo duro: sin esto en `true`, el cron no manda nada
// del estudio, esté como esté configurado el certificado.
//
// La respuesta depende de una autorización que se da FUERA de Tentare: el poder
// IZ860 que el estudio otorga en la sede de la AEAT al NIF del apoderado. Hasta
// que exista el flujo de alta que lo registra y lo verifica (PR 3 de esta
// serie), NINGÚN estudio está habilitado. No hay forma de «forzarlo» desde aquí,
// a propósito.

import type { SupabaseClient } from '@supabase/supabase-js';

export type MotivoNoHabilitado =
  | 'SIN_AUTORIZACION_VERIFICADA'
  | 'ESTUDIO_DE_DEMOSTRACION'
  | 'PAUSADO'
  | 'SUSPENDIDO_AEAT'
  | 'NO_EN_PRODUCCION'
  | 'PODER_CADUCADO';

export type Habilitacion = { habilitado: true } | { habilitado: false; motivo: MotivoNoHabilitado };

export async function estudioHabilitado(_admin: SupabaseClient, _studioId: string): Promise<Habilitacion> {
  return { habilitado: false, motivo: 'SIN_AUTORIZACION_VERIFICADA' };
}

/** Efectos de estudio que pide la AEAT (4112/4140 → pausa). Hasta la PR 3 solo se registran. */
export async function pausarEstudio(_admin: SupabaseClient, _studioId: string, _motivo: string): Promise<void> {
  // La PR 3 lo escribe en `verifactu_estudios` y avisa a la propietaria.
}
