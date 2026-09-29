// Bloqueo duro: hasta que exista el flujo que registra y verifica el poder IZ860
// de cada estudio, NINGÚN estudio puede transmitir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { estudioHabilitado } from './habilitacion.ts';

test('estudio sin poder verificado → no habilitado: el cron no manda nada de él', async () => {
  const admin = {} as SupabaseClient;
  const h = await estudioHabilitado(admin, 'studio-cualquiera');
  assert.equal(h.habilitado, false);
  assert.equal(!h.habilitado && h.motivo, 'SIN_AUTORIZACION_VERIFICADA');
});
