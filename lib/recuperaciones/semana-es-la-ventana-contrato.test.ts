import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// «La semana es la ventana» (migración 20261026234549): un estudio con `recuperacion_solo_en_la_semana` no concede NINGUNA
// recuperación por cancelar, ni al cancelar una plaza fija a tiempo ni en el barrido de los lunes. Lo que da una persona a mano,
// el CSV y la compensación por un fallo del estudio siguen. El efecto sobre el límite semanal lo cubre `calcular_excede_limite_semanal`
// (una reserva cancelada no cuenta); aquí se fija que los dos caminos AUTOMÁTICOS respetan el ajuste y que nace apagado.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (f: string) => readFileSync(join(raiz, f), 'utf8');

test('la migración añade la columna apagada de serie y la deja guardar desde Configuración', () => {
  const sql = leer('supabase/migrations/20261026234549_recuperacion_solo_en_la_semana.sql').replace(/--.*$/gm, '');
  assert.match(sql, /add column if not exists recuperacion_solo_en_la_semana boolean not null default false/);
  assert.match(sql, /grant update \(recuperacion_solo_en_la_semana\) on public\.studios to authenticated/);
});

test('al cancelar una plaza fija a tiempo, el ajuste corta antes de crear la recuperación (y antes del reparto semanal)', () => {
  const f = leer('lib/db/supabase-data-admin.ts');
  const i = f.indexOf('async function otorgarRecuperacionPlazaFijaSiAplica');
  const cuerpo = f.slice(i, f.indexOf('export async function ejecutarCancelacionReserva', i));
  const ventana = cuerpo.indexOf('recuperacion_solo_en_la_semana === true');
  assert.ok(ventana > 0, 'el helper lee el ajuste');
  assert.ok(ventana < cuerpo.indexOf("rpc('crear_recuperacion'"), 'y decide antes de crearla');
  assert.ok(ventana < cuerpo.indexOf('recuperacion_auto_semanal === true'), 'y antes del reparto al cerrar la semana');
});

test('el barrido semanal no mira a los estudios con el ajuste', () => {
  const f = leer('lib/recuperaciones/otorgar-semanales.ts');
  assert.match(f, /\.eq\('recuperacion_auto_semanal', true\)[\s\S]{0,200}\.eq\('recuperacion_solo_en_la_semana', false\)/);
});

test('Configuración lo ofrece en la tarjeta de Recuperaciones y se guarda con las demás columnas', () => {
  assert.match(leer('components/configuracion/tab-estudio-reservas.tsx'), /recuperacionSoloEnLaSemana/);
  assert.match(leer('lib/supabase-data.ts'), /db\.recuperacion_solo_en_la_semana = changes\.recuperacionSoloEnLaSemana/);
  assert.match(leer('lib/supabase-data.ts'), /recuperacionSoloEnLaSemana: r\.recuperacion_solo_en_la_semana \?\? false/);
});
