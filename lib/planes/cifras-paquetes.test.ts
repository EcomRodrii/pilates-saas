import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifrasPaquetes, clientasPorPlan, datosDeTarjeta, precioCorto, suscripcionVigente } from './cifras-paquetes.ts';

const HOY = '2026-10-14';

const planes = [
  { id: 'mes', tipo: 'MENSUAL', precio: 55, activo: true },
  { id: 'tri', tipo: 'MENSUAL', precio: 240, activo: true, periodicidadMeses: 3 },
  { id: 'bono10', tipo: 'BONO', precio: 120, activo: true },
  { id: 'suelta', tipo: 'PUNTUAL', precio: 18, activo: false },
  { id: 'borrador', tipo: 'BONO', precio: 0, activo: false },
];

const s = (planId: string, socioId: string, extra: Record<string, unknown> = {}) => ({
  planId, socioId, estado: 'ACTIVA', fechaInicio: '2026-09-01', fechaFin: null as string | null, ...extra,
});

test('vigente: ACTIVA y sin la fecha de fin pasada (el día de hoy aún vale)', () => {
  assert.equal(suscripcionVigente({ estado: 'ACTIVA', fechaFin: null }, HOY), true);
  assert.equal(suscripcionVigente({ estado: 'ACTIVA', fechaFin: HOY }, HOY), true);
  assert.equal(suscripcionVigente({ estado: 'ACTIVA', fechaFin: '2026-10-13' }, HOY), false);
  assert.equal(suscripcionVigente({ estado: 'PAUSADA', fechaFin: null }, HOY), false);
});

test('el ingreso recurrente es solo de cuotas y por mes: una trimestral de 240 € son 80 € al mes', () => {
  const c = cifrasPaquetes({
    planes,
    hoy: HOY,
    suscripciones: [
      s('mes', 'ana'),
      s('mes', 'bea', { fechaFin: '2026-10-31' }),
      s('tri', 'ana'),
      s('mes', 'cris', { fechaFin: '2026-10-10' }), // vencida sin renovar: no cuenta
      s('mes', 'dani', { estado: 'CANCELADA' }),
      s('bono10', 'eva'), // un bono no es ingreso recurrente
      s('desaparecida', 'fer'), // tarifa borrada: no se sabe qué era
    ],
  });
  assert.equal(c.cuotasActivas, 3);
  assert.equal(c.clientasConCuota, 2, 'ana tiene dos cuotas: es una persona');
  assert.equal(c.recurrenteAlMes, 55 + 55 + 80);
  assert.equal(c.clientasConPlan, 3, 'ana, bea y eva');
});

test('bonos vendidos: los que empezaron este mes hasta hoy, frente al mes pasado a estas alturas', () => {
  const c = cifrasPaquetes({
    planes,
    hoy: HOY,
    suscripciones: [
      s('bono10', 'a', { fechaInicio: '2026-10-01' }),
      s('bono10', 'b', { fechaInicio: '2026-10-14', estado: 'EXPIRADA' }), // vendido aunque ya no esté activo
      s('bono10', 'c', { fechaInicio: '2026-10-20' }), // aún no ha empezado
      s('bono10', 'd', { fechaInicio: '2026-10-05', estado: 'CANCELADA' }), // anulado: no es una venta
      s('bono10', 'e', { fechaInicio: '2026-09-14' }),
      s('bono10', 'f', { fechaInicio: '2026-09-15' }), // pasado el día 14: no cuenta para comparar
      s('mes', 'g', { fechaInicio: '2026-10-02' }), // una cuota no es un bono
    ],
  });
  assert.equal(c.bonosMes, 2);
  assert.equal(c.bonosMesAnteriorAlDia, 1);
  assert.equal(c.mesAnterior, 'septiembre');
});

test('a la venta, retiradas y borradores', () => {
  const c = cifrasPaquetes({ planes, hoy: HOY, suscripciones: [] });
  assert.deepEqual([c.aLaVenta, c.sinVender, c.borradores, c.total], [3, 1, 1, 5]);
  assert.equal(cifrasPaquetes({ planes: [], hoy: '2026-01-10', suscripciones: [] }).mesAnterior, 'diciembre');
});

test('quién tiene cada tarifa: personas distintas con ella vigente', () => {
  const m = clientasPorPlan([s('bono10', 'ana'), s('bono10', 'ana'), s('bono10', 'bea'), s('bono10', 'cris', { estado: 'EXPIRADA' })], HOY);
  assert.equal(m.get('bono10'), 2);
  assert.equal(m.get('mes'), undefined);
});

test('lo que enseña cada tarjeta, por tipo', () => {
  assert.deepEqual(datosDeTarjeta({ tipo: 'MENSUAL', precio: 55, sesiones: null, limiteSemanal: 2 }), {
    sesiones: '2 clases por semana', caducidad: 'Se renueva cada mes', porSesion: null,
  });
  assert.equal(datosDeTarjeta({ tipo: 'MENSUAL', precio: 240, sesiones: null, periodicidadMeses: 3 }).caducidad, 'Se renueva cada trimestre');
  assert.equal(datosDeTarjeta({ tipo: 'MENSUAL', precio: 55, sesiones: null }).sesiones, 'Clases sin límite');
  assert.equal(
    datosDeTarjeta({ tipo: 'MENSUAL', precio: 80, sesiones: null, limitePorTipo: { maquina: 2, gyro: null } }).sesiones,
    'Con tope semanal por tipo de clase',
    'una cuota combinada sin tope total no es «sin límite»',
  );
  assert.deepEqual(datosDeTarjeta({ tipo: 'BONO', precio: 100, sesiones: 3, validezDias: 60, limiteSemanal: 1 }), {
    sesiones: '3 sesiones, 1 por semana', caducidad: 'Caduca a los 60 días', porSesion: 33.33,
  });
  assert.deepEqual(datosDeTarjeta({ tipo: 'PUNTUAL', precio: 18, sesiones: 1 }), { sesiones: '1 sesión', caducidad: 'Sin caducidad', porSesion: null });
  assert.equal(datosDeTarjeta({ tipo: 'BONO', precio: 0, sesiones: 10 }).porSesion, null, 'un borrador sin precio no tiene precio por sesión');
});

test('el precio grande no redondea los céntimos', () => {
  assert.equal(precioCorto(55), '55 €');
  assert.equal(precioCorto(55.5), '55,50 €');
  assert.equal(precioCorto(33.33), '33,33 €');
});
