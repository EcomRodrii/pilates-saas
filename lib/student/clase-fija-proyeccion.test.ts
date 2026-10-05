import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proyectarCalendarioClaseFija, proyectarClases, proyectarPlazasFijas, type PayloadMin } from './mapeo.ts';
import { proximasSemanas } from './clase-fija-vista.ts';

// Clase fija los lunes a las 10:00, con su reserva `res-pf-` en las próximas 7 semanas.
// El cambio de hora es el 25 de octubre: antes +02:00, después +01:00.
const LUNES = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
const desfase = (f: string) => (f < '2026-10-25' ? '+02:00' : '+01:00');

function payload(opts: {
  tipos?: Record<string, number | null>;
  tipoDeSesion?: (i: number) => string;
  studio?: { penalizacionImporteEur?: number | null; penalizacionAplicaCancelacionTardia?: boolean | null };
} = {}): PayloadMin {
  const tipos = opts.tipos ?? { tc: null };
  return {
    studio: { ...opts.studio },
    sesiones: LUNES.map((f, i) => ({
      id: `s${i}`, inicio: `${f}T10:00:00${desfase(f)}`, fin: `${f}T10:50:00${desfase(f)}`, aforoMaximo: 10,
      tipoClaseId: opts.tipoDeSesion?.(i) ?? 'tc', salaId: 'sala-1', instructorId: 'ins-1', cancelada: false, precioPuntual: null,
    })),
    tiposClase: Object.entries(tipos).map(([id, importe]) => ({ id, nombre: id, penalizacionImporteEur: importe })),
    salas: [{ id: 'sala-1', nombre: 'Sala 1' }],
    socia: {
      // Sin tipo: como las importadas, se reserva en la clase de la franja sea del tipo que sea.
      plazasFijas: [{ id: 'pf-1', diaSemana: 1, horaInicio: '10:00:00', salaId: 'sala-1', tipoClaseId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA' }],
      reservas: LUNES.map((_, i) => ({ id: `res-pf-${i}`, sesionId: `s${i}`, socioId: 'so-1', estado: 'CONFIRMADA', creadoEn: '2026-09-01T00:00:00Z', posicionEspera: null })),
    },
  } as unknown as PayloadMin;
}

test('con la pantalla abierta, al empezar la clase de hoy la 5.ª semana conserva su reserva (cargada 09:55, reloj 10:01)', () => {
  const d = payload();
  const [plaza] = proyectarPlazasFijas(d, '2026-10-05', '09:55');
  const semanas = proximasSemanas(plaza, proyectarCalendarioClaseFija(d), '2026-10-05', '10:01');
  assert.deepEqual(semanas.map((s) => s.fecha), ['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
  assert.deepEqual(semanas.map((s) => s.estado), ['va', 'va', 'va', 'va', 'va'], 'ninguna «reservada a mano»');
  assert.deepEqual(semanas.map((s) => s.reservaId), ['res-pf-1', 'res-pf-2', 'res-pf-3', 'res-pf-4', 'res-pf-5']);
});

test('la penalización de «no voy» se resuelve por la SESIÓN, con la misma regla que la detección y el guardia', () => {
  // Plaza sin tipo; las sesiones alternan un tipo con 0 € y otro que hereda el del estudio (8 €).
  const d = payload({
    tipos: { gratis: 0, normal: null },
    tipoDeSesion: (i) => (i % 2 === 0 ? 'gratis' : 'normal'),
    studio: { penalizacionImporteEur: 8, penalizacionAplicaCancelacionTardia: true },
  });
  const [plaza] = proyectarPlazasFijas(d, '2026-10-01', '09:00');
  assert.deepEqual(plaza.proximas.slice(0, 4).map((p) => p.penalizacionTardiaEur), [null, 8, null, 8]);
  // Y en la ficha de la clase (lo usa la confirmación de «Próximas»), lo mismo.
  const clases = proyectarClases(d);
  assert.equal(clases.find((c) => c.id === 's0')?.penalizacionTardiaEur, null);
  assert.equal(clases.find((c) => c.id === 's1')?.penalizacionTardiaEur, 8);
});

test('con «Cobrar si cancela tarde» apagado, ninguna sesión avisa de cobrar', () => {
  const d = payload({ studio: { penalizacionImporteEur: 8, penalizacionAplicaCancelacionTardia: false } });
  const [plaza] = proyectarPlazasFijas(d, '2026-10-01', '09:00');
  assert.ok(plaza.proximas.every((p) => p.penalizacionTardiaEur === null));
});

test('un tipo con importe propio y el estudio sin importe: lo detecta el SQL, pero no se cobra → no se avisa', () => {
  const d = payload({ tipos: { tc: 10 }, studio: { penalizacionImporteEur: null } });
  const [plaza] = proyectarPlazasFijas(d, '2026-10-01', '09:00');
  assert.ok(plaza.proximas.every((p) => p.penalizacionTardiaEur === null));
});

test('el payload público del estudio manda si cobra las cancelaciones tardías (como la RPC: sin dato, sí)', async () => {
  const { readFileSync } = await import('node:fs');
  const admin = readFileSync(new URL('../db/supabase-data-admin.ts', import.meta.url), 'utf8');
  const cuerpo = admin.slice(admin.indexOf('function studioPublico('), admin.indexOf('\n}\n', admin.indexOf('function studioPublico(')));
  assert.match(cuerpo, /penalizacionAplicaCancelacionTardia: r\.penalizacion_aplica_cancelacion_tardia \?\? true,/);
});
