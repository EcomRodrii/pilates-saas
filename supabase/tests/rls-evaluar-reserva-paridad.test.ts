// Motor de derechos, FASE 3b (migración 20261002160000): PARIDAD entre `evaluar_reserva` y `reservar_plaza`.
//
// `evaluar_reserva` es la elegibilidad en un solo sitio, de solo lectura y EN SOMBRA: reproduce las comprobaciones de
// `reservar_plaza` pero no decide nada. Lo único que las mantiene de acuerdo es este fichero: cada escenario monta un
// estado real, pregunta a `evaluar_reserva` y DESPUÉS reserva de verdad con `reservar_plaza`, y exige que las dos digan
// lo mismo — el mismo rechazo (por su código), o el mismo estado y la misma posición en la lista de espera, y que quien
// pague sea quien `evaluar_reserva` anunció (el bono elegido, la recuperación, o nadie).
//
// Si algún día `reservar_plaza` cambia una regla y `evaluar_reserva` no (o al revés), este fichero se pone rojo. Cuando la
// paridad aguante en producción, `reservar_plaza` pasará a decidir con `evaluar_reserva`.
//
// Se llama con `admin` (service_role) porque es como la llama la app.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-par-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000);

/** Lo mismo que hace `crearReservaPublica` con las excepciones de `reservar_plaza` (lib/db/supabase-data-admin.ts). */
function codigoDeError(mensaje: string): string {
  if (mensaje.includes('YA_RESERVADA')) return 'ya-reservada';
  if (mensaje.includes('SESION_NO_ENCONTRADA')) return 'sesion-no-encontrada';
  if (mensaje.includes('CONFLICTO_HORARIO')) return 'conflicto-horario';
  if (mensaje.includes('SPOT_OCUPADO')) return 'spot-ocupado';
  if (mensaje.includes('SPOT_NO_PERTENECE_A_LA_SALA') || mensaje.includes('SPOT_NO_DISPONIBLE')) return 'spot-no-disponible';
  if (mensaje.includes('LIMITE_SEMANAL_ACTIVIDAD')) return 'limite-semanal-actividad';
  if (mensaje.includes('LIMITE_SEMANAL')) return 'limite-semanal';
  if (mensaje.includes('RESERVA_BLOQUEADA_IMPAGO')) return 'impago';
  if (mensaje.includes('SIN_ENTITLEMENT')) return 'sin-plan';
  if (mensaje.includes('NECESITA_AUTORIZACION')) return 'necesita-autorizacion';
  if (mensaje.includes('AFORO_LLENO_SIN_ESPERA')) return 'aforo-lleno';
  if (mensaje.includes('ESTUDIO_CERRADO')) return 'estudio-cerrado';
  if (mensaje.includes('NO_AUTORIZADO')) return 'no-autorizado';
  return `error:${mensaje}`;
}

interface Evaluacion {
  puede: boolean; codigo: string | null; estado: string | null; posicion_espera: number | null;
  pagador?: { origen: string; suscripcion_id?: string; recuperacion_id?: string };
}

interface Esperado {
  puede: boolean; codigo?: string; estado?: string; posicion?: number | null;
  pagador?: 'recuperacion' | 'bono' | 'cuota' | 'ninguno';
}

interface Preparado {
  sesionId: string; socioId: string; opciones?: Record<string, unknown>; esperado: Esperado;
  /** Los bonos que NO deben tocarse (saldo conocido antes de reservar). */
  bonosIntactos?: string[];
}

/** Los fixtures de un estudio, para que cada escenario cuente su estado en pocas líneas. */
class Ctx {
  constructor(readonly studioId: string) {}

  async socia() { return crearSocia(admin, this.studioId); }

  async tipo(p: { requiereAutorizacion?: boolean } = {}) {
    const id = idUnico('tc');
    const { error } = await admin.from('tipos_clase').insert({
      id, studio_id: this.studioId, nombre: `Tipo ${id}`, requiere_autorizacion: p.requiereAutorizacion ?? false,
    });
    assert.ok(!error, `tipo de clase: ${error?.message}`);
    return id;
  }

  async plan(p: { tipo: 'BONO' | 'MENSUAL'; sesiones?: number | null; limiteSemanal?: number | null; tipos?: string[]; limitePorTipo?: Record<string, number> }) {
    const id = idUnico('plan');
    const { error } = await admin.from('planes_tarifa').insert({
      id, studio_id: this.studioId, nombre: `Plan ${p.tipo}`, precio: 10, tipo: p.tipo,
      sesiones: p.sesiones ?? null, limite_semanal: p.limiteSemanal ?? null,
    });
    assert.ok(!error, `plan: ${error?.message}`);
    for (const t of p.tipos ?? []) {
      const { error: e } = await admin.from('plan_tipos_clase').insert({
        plan_id: id, tipo_clase_id: t, studio_id: this.studioId, limite_semanal: p.limitePorTipo?.[t] ?? null,
      });
      assert.ok(!e, `plan_tipos_clase: ${e?.message}`);
    }
    return id;
  }

  async sus(socioId: string, planId: string, saldo: number | null, fechaFin: string | null = null) {
    const id = idUnico('sus');
    const { error } = await admin.from('suscripciones').insert({
      id, studio_id: this.studioId, socio_id: socioId, plan_id: planId, estado: 'ACTIVA', fecha_inicio: hoy(),
      sesiones_restantes: saldo, fecha_fin: fechaFin,
    });
    assert.ok(!error, `suscripción: ${error?.message}`);
    return id;
  }

  async sesion(inicio: Date, p: { tipo: string | null; aforo?: number; duracionMin?: number }) {
    const id = idUnico('ses');
    const { error } = await admin.from('sesiones').insert({
      id, studio_id: this.studioId, tipo_clase_id: p.tipo, inicio: inicio.toISOString(),
      fin: new Date(inicio.getTime() + (p.duracionMin ?? 50) * 60_000).toISOString(), aforo_maximo: p.aforo ?? 10,
    });
    assert.ok(!error, `sesión: ${error?.message}`);
    return id;
  }

  async reserva(sesionId: string, socioId: string, estado: string) {
    const id = idUnico('res');
    const { error } = await admin.from('reservas').insert({
      id, studio_id: this.studioId, sesion_id: sesionId, socio_id: socioId, estado, bono_consumo_rastreado: true,
    });
    assert.ok(!error, `reserva: ${error?.message}`);
    return id;
  }

  async recuperacion(socioId: string, caducaEnDias: number) {
    const id = idUnico('rec');
    const { error } = await admin.from('recuperaciones').insert({
      id, studio_id: this.studioId, socio_id: socioId, motivo: 'test',
      caduca_el: enDias(caducaEnDias).toISOString().slice(0, 10),
    });
    assert.ok(!error, `recuperación: ${error?.message}`);
    return id;
  }

  async autorizar(socioId: string, tipoId: string) {
    const { error } = await admin.from('socio_tipos_clase_autorizados').insert({ socio_id: socioId, tipo_clase_id: tipoId, studio_id: this.studioId });
    assert.ok(!error, `autorización: ${error?.message}`);
  }
}

/** Un martes y un miércoles a mediodía UTC de una semana FUTURA: misma semana en Madrid, sea cual sea el día de hoy. */
function semanaFutura() {
  const base = enDias(21);
  const alMartes = (2 - base.getUTCDay() + 7) % 7;
  const martes = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + alMartes, 12, 0, 0));
  return { martes, miercoles: new Date(martes.getTime() + 86_400_000) };
}

async function saldoDe(id: string) {
  const { data } = await admin.from('suscripciones').select('sesiones_restantes').eq('id', id).single();
  return (data as { sesiones_restantes: number | null }).sesiones_restantes;
}

const escenarios: { nombre: string; preparar: (c: Ctx) => Promise<Preparado> }[] = [
  {
    nombre: 'sin plan exigido (el estudio no lo pide): entra, no paga nadie',
    async preparar(c) {
      const socio = await c.socia(); const sesion = await c.sesion(enDias(3), { tipo: await c.tipo() });
      return { sesionId: sesion, socioId: socio, opciones: { exigir_entitlement: false }, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'ninguno' } };
    },
  },
  {
    nombre: 'sin plan y el estudio lo exige → sin-plan',
    async preparar(c) {
      const socio = await c.socia(); const sesion = await c.sesion(enDias(3), { tipo: await c.tipo() });
      return { sesionId: sesion, socioId: socio, esperado: { puede: false, codigo: 'sin-plan' } };
    },
  },
  {
    nombre: 'bono con sesiones: entra y paga ESE bono',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'BONO', sesiones: 10 }), 4);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'bono' } };
    },
  },
  {
    nombre: 'bono agotado → sin-plan',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'BONO', sesiones: 10 }), 0);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: false, codigo: 'sin-plan' } };
    },
  },
  {
    nombre: 'bono acotado a otro tipo de clase → sin-plan',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo(); const otro = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'BONO', sesiones: 10, tipos: [otro] }), 4);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: false, codigo: 'sin-plan' } };
    },
  },
  {
    nombre: 'bono caducado → sin-plan',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'BONO', sesiones: 10 }), 4, enDias(-2).toISOString().slice(0, 10));
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: false, codigo: 'sin-plan' } };
    },
  },
  {
    nombre: 'mensual: entra y la paga la cuota (ningún bono se toca)',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'cuota' } };
    },
  },
  {
    nombre: 'mensual Y bono: gana la cuota, el bono no se toca',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const bono = await c.sus(socio, await c.plan({ tipo: 'BONO', sesiones: 10 }), 4);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'cuota' }, bonosIntactos: [bono] };
    },
  },
  {
    nombre: 'dos bonos: paga el ACOTADO a ese tipo aunque el general caduque antes',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'BONO', sesiones: 10 }), 5, enDias(2).toISOString().slice(0, 10));
      await c.sus(socio, await c.plan({ tipo: 'BONO', sesiones: 10, tipos: [tipo] }), 5, enDias(300).toISOString().slice(0, 10));
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'bono' } };
    },
  },
  {
    nombre: 'ya reservada → ya-reservada',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const sesion = await c.sesion(enDias(3), { tipo });
      await c.reserva(sesion, socio, 'CONFIRMADA');
      return { sesionId: sesion, socioId: socio, esperado: { puede: false, codigo: 'ya-reservada' } };
    },
  },
  {
    nombre: 'una reserva CANCELADA no cuenta como «ya reservada»',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const sesion = await c.sesion(enDias(3), { tipo });
      await c.reserva(sesion, socio, 'CANCELADA');
      return { sesionId: sesion, socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'cuota' } };
    },
  },
  {
    nombre: 'clase llena con lista de espera → LISTA_ESPERA en la posición 1, sin pagar',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const sesion = await c.sesion(enDias(3), { tipo, aforo: 1 });
      await c.reserva(sesion, await c.socia(), 'CONFIRMADA');
      return { sesionId: sesion, socioId: socio, esperado: { puede: true, estado: 'LISTA_ESPERA', posicion: 1, pagador: 'ninguno' } };
    },
  },
  {
    nombre: 'clase llena con una persona ya esperando → posición 2',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const sesion = await c.sesion(enDias(3), { tipo, aforo: 1 });
      await c.reserva(sesion, await c.socia(), 'CONFIRMADA');
      await c.reserva(sesion, await c.socia(), 'LISTA_ESPERA');
      return { sesionId: sesion, socioId: socio, esperado: { puede: true, estado: 'LISTA_ESPERA', posicion: 2, pagador: 'ninguno' } };
    },
  },
  {
    nombre: 'clase llena y sin lista de espera → aforo-lleno',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const sesion = await c.sesion(enDias(3), { tipo, aforo: 1 });
      await c.reserva(sesion, await c.socia(), 'CONFIRMADA');
      return { sesionId: sesion, socioId: socio, opciones: { permite_lista_espera: false }, esperado: { puede: false, codigo: 'aforo-lleno' } };
    },
  },
  {
    nombre: 'requiere aprobación → PENDIENTE_APROBACION, sin pagar todavía',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, opciones: { requiere_aprobacion: true }, esperado: { puede: true, estado: 'PENDIENTE_APROBACION', pagador: 'ninguno' } };
    },
  },
  {
    nombre: 'choca con otra clase suya a la misma hora → conflicto-horario',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const inicio = enDias(3);
      await c.reserva(await c.sesion(inicio, { tipo }), socio, 'CONFIRMADA');
      return { sesionId: await c.sesion(inicio, { tipo }), socioId: socio, esperado: { puede: false, codigo: 'conflicto-horario' } };
    },
  },
  {
    nombre: 'en la lista de espera el solape NO se mira (solo al confirmar)',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      const inicio = enDias(3);
      await c.reserva(await c.sesion(inicio, { tipo }), socio, 'CONFIRMADA');
      const llena = await c.sesion(inicio, { tipo, aforo: 1 });
      await c.reserva(llena, await c.socia(), 'CONFIRMADA');
      return { sesionId: llena, socioId: socio, esperado: { puede: true, estado: 'LISTA_ESPERA', posicion: 1, pagador: 'ninguno' } };
    },
  },
  {
    nombre: 'tope semanal alcanzado y sin recuperación → limite-semanal',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo(); const { martes, miercoles } = semanaFutura();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL', limiteSemanal: 1 }), null);
      await c.reserva(await c.sesion(martes, { tipo }), socio, 'CONFIRMADA');
      return { sesionId: await c.sesion(miercoles, { tipo }), socioId: socio, esperado: { puede: false, codigo: 'limite-semanal' } };
    },
  },
  {
    nombre: 'tope semanal alcanzado CON recuperación → entra y paga la recuperación',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo(); const { martes, miercoles } = semanaFutura();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL', limiteSemanal: 1 }), null);
      await c.reserva(await c.sesion(martes, { tipo }), socio, 'CONFIRMADA');
      await c.recuperacion(socio, 20);
      return { sesionId: await c.sesion(miercoles, { tipo }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'recuperacion' } };
    },
  },
  {
    nombre: 'tope semanal alcanzado y la recuperación está CADUCADA → limite-semanal',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo(); const { martes, miercoles } = semanaFutura();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL', limiteSemanal: 1 }), null);
      await c.reserva(await c.sesion(martes, { tipo }), socio, 'CONFIRMADA');
      await c.recuperacion(socio, -3);
      return { sesionId: await c.sesion(miercoles, { tipo }), socioId: socio, esperado: { puede: false, codigo: 'limite-semanal' } };
    },
  },
  {
    nombre: 'el NO-SHOW cuenta como uso para el tope semanal → limite-semanal',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo(); const { martes, miercoles } = semanaFutura();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL', limiteSemanal: 1 }), null);
      await c.reserva(await c.sesion(martes, { tipo }), socio, 'NO_ASISTIO');
      return { sesionId: await c.sesion(miercoles, { tipo }), socioId: socio, esperado: { puede: false, codigo: 'limite-semanal' } };
    },
  },
  {
    nombre: 'una reserva CANCELADA no gasta el tope semanal',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo(); const { martes, miercoles } = semanaFutura();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL', limiteSemanal: 1 }), null);
      await c.reserva(await c.sesion(martes, { tipo }), socio, 'CANCELADA');
      return { sesionId: await c.sesion(miercoles, { tipo }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'cuota' } };
    },
  },
  {
    nombre: 'tope por actividad alcanzado → limite-semanal-actividad',
    async preparar(c) {
      const socio = await c.socia(); const reformer = await c.tipo(); const mat = await c.tipo(); const { martes, miercoles } = semanaFutura();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL', tipos: [reformer, mat], limitePorTipo: { [reformer]: 1 } }), null);
      await c.reserva(await c.sesion(martes, { tipo: reformer }), socio, 'CONFIRMADA');
      return { sesionId: await c.sesion(miercoles, { tipo: reformer }), socioId: socio, esperado: { puede: false, codigo: 'limite-semanal-actividad' } };
    },
  },
  {
    nombre: 'tope por actividad: otra actividad de la misma cuota sí entra',
    async preparar(c) {
      const socio = await c.socia(); const reformer = await c.tipo(); const mat = await c.tipo(); const { martes, miercoles } = semanaFutura();
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL', tipos: [reformer, mat], limitePorTipo: { [reformer]: 1 } }), null);
      await c.reserva(await c.sesion(martes, { tipo: reformer }), socio, 'CONFIRMADA');
      return { sesionId: await c.sesion(miercoles, { tipo: mat }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'cuota' } };
    },
  },
  {
    nombre: 'clase que exige autorización y la socia no la tiene → necesita-autorizacion',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo({ requiereAutorizacion: true });
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: false, codigo: 'necesita-autorizacion' } };
    },
  },
  {
    nombre: 'clase que exige autorización y la socia SÍ la tiene → entra',
    async preparar(c) {
      const socio = await c.socia(); const tipo = await c.tipo({ requiereAutorizacion: true });
      await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
      await c.autorizar(socio, tipo);
      return { sesionId: await c.sesion(enDias(3), { tipo }), socioId: socio, esperado: { puede: true, estado: 'CONFIRMADA', pagador: 'cuota' } };
    },
  },
  {
    nombre: 'sesión que no existe → sesion-no-encontrada',
    async preparar(c) {
      const socio = await c.socia();
      return { sesionId: 'ses-que-no-existe', socioId: socio, esperado: { puede: false, codigo: 'sesion-no-encontrada' } };
    },
  },
];

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

for (const escenario of escenarios) {
  test(`paridad: ${escenario.nombre}`, async () => {
    await conEstudio(async studio => {
      const c = new Ctx(studio.studioId);
      const p = await escenario.preparar(c);
      const opciones = p.opciones ?? {};
      const saldosAntes = new Map<string, number | null>();
      for (const id of p.bonosIntactos ?? []) saldosAntes.set(id, await saldoDe(id));

      // 1) La evaluación (de solo lectura) ANTES de reservar: después el estado ya habrá cambiado.
      const { data: bruto, error: errEvaluar } = await admin.rpc('evaluar_reserva', {
        p_studio_id: studio.studioId, p_sesion_id: p.sesionId, p_socio_id: p.socioId, p_opciones: opciones,
      });
      assert.ok(!errEvaluar, `evaluar_reserva falló: ${errEvaluar?.message}`);
      const ev = bruto as Evaluacion;

      // Lo que el escenario DICE que tiene que pasar (la regla de negocio, no solo «las dos coinciden»).
      assert.equal(ev.puede, p.esperado.puede, `evaluar_reserva: puede=${ev.puede} (codigo ${ev.codigo})`);
      if (p.esperado.codigo !== undefined) assert.equal(ev.codigo, p.esperado.codigo);
      if (p.esperado.estado !== undefined) assert.equal(ev.estado, p.esperado.estado);
      if (p.esperado.posicion !== undefined) assert.equal(ev.posicion_espera, p.esperado.posicion);
      if (p.esperado.pagador !== undefined) assert.equal(ev.pagador?.origen, p.esperado.pagador);

      // 2) La reserva de verdad, como la hace la app: con el bono que evaluar_reserva anunció (o ninguno).
      const reservaId = idUnico('res-real');
      const { data, error } = await admin.rpc('reservar_plaza', {
        p_studio_id: studio.studioId, p_sesion_id: p.sesionId, p_socio_id: p.socioId, p_reserva_id: reservaId,
        p_permite_lista_espera: (opciones.permite_lista_espera as boolean | undefined) ?? true,
        p_requiere_aprobacion: (opciones.requiere_aprobacion as boolean | undefined) ?? false,
        p_spot_id: null,
        p_saltar_gate_impago: (opciones.saltar_gate_impago as boolean | undefined) ?? false,
        p_exigir_entitlement: (opciones.exigir_entitlement as boolean | undefined) ?? true,
        p_suscripcion_id: ev.pagador?.origen === 'bono' ? (ev.pagador.suscripcion_id ?? null) : null,
      });

      // 3) PARIDAD: lo mismo.
      if (!ev.puede) {
        assert.ok(error, `evaluar_reserva rechazó (${ev.codigo}) pero reservar_plaza aceptó`);
        assert.equal(codigoDeError(error.message), ev.codigo, `reservar_plaza rechazó por otra razón: ${error.message}`);
        return;
      }
      assert.ok(!error, `evaluar_reserva dijo que sí pero reservar_plaza rechazó: ${error?.message}`);
      const fila = (data as { estado: string; posicion_espera: number | null }[])[0];
      assert.equal(fila.estado, ev.estado, 'el estado en el que entra');
      assert.equal(fila.posicion_espera ?? null, ev.posicion_espera ?? null, 'la posición en la lista de espera');

      // 4) Y paga quien se dijo.
      const { data: res } = await admin.from('reservas').select('bono_suscripcion_id').eq('id', reservaId).single();
      const bonoDeLaReserva = (res as { bono_suscripcion_id: string | null }).bono_suscripcion_id;
      const { data: recuperaciones } = await admin.from('recuperaciones').select('id, estado').eq('usada_en_reserva_id', reservaId);
      const origen = ev.pagador?.origen ?? 'ninguno';
      if (origen === 'bono') {
        assert.equal(bonoDeLaReserva, ev.pagador?.suscripcion_id, 'se gastó OTRO bono del que se anunció');
        assert.equal((recuperaciones ?? []).length, 0, 'un bono Y una recuperación: dos pagadores');
      } else if (origen === 'recuperacion') {
        assert.equal((recuperaciones ?? []).length, 1, 'se anunció una recuperación y no se gastó');
        assert.equal((recuperaciones as { id: string }[])[0].id, ev.pagador?.recuperacion_id, 'se gastó OTRA recuperación');
        assert.equal(bonoDeLaReserva, null, 'una recuperación Y un bono: dos pagadores');
      } else {
        assert.equal(bonoDeLaReserva, null, `${origen}: no debe gastarse ningún bono`);
        assert.equal((recuperaciones ?? []).length, 0, `${origen}: no debe gastarse ninguna recuperación`);
      }
      for (const [id, antes] of saldosAntes) assert.equal(await saldoDe(id), antes, 'un bono que no tocaba ha cambiado de saldo');
    });
  });
}

test('la batería cubre lo que importa: ≥ 25 escenarios y todos los rechazos de la RPC que se pueden montar', () => {
  assert.ok(escenarios.length >= 25, `solo ${escenarios.length} escenarios`);
  const codigos = new Set(escenarios.flatMap(e => e.nombre.match(/→ ([a-z-]+)/g) ?? []).map(s => s.slice(2)));
  for (const esperado of [
    'sin-plan', 'ya-reservada', 'aforo-lleno', 'conflicto-horario', 'limite-semanal', 'limite-semanal-actividad',
    'necesita-autorizacion', 'sesion-no-encontrada',
  ]) assert.ok(codigos.has(esperado), `ningún escenario cubre ${esperado}`);
});

test('evaluar_reserva no toma candados ni escribe: es una foto', async () => {
  await conEstudio(async studio => {
    const c = new Ctx(studio.studioId);
    const socio = await c.socia(); const tipo = await c.tipo();
    await c.sus(socio, await c.plan({ tipo: 'MENSUAL' }), null);
    const sesion = await c.sesion(enDias(3), { tipo });
    for (let i = 0; i < 3; i++) {
      const { error } = await admin.rpc('evaluar_reserva', { p_studio_id: studio.studioId, p_sesion_id: sesion, p_socio_id: socio, p_opciones: {} });
      assert.ok(!error, error?.message);
    }
    const { data } = await admin.from('reservas').select('id').eq('sesion_id', sesion);
    assert.equal((data ?? []).length, 0, 'evaluar_reserva ha creado una reserva');
  });
});

test('solo el servidor puede llamarla: ni la propietaria desde su sesión', async () => {
  await conEstudio(async studio => {
    const { error } = await studio.comoPropietaria.rpc('evaluar_reserva', {
      p_studio_id: studio.studioId, p_sesion_id: 'x', p_socio_id: 'y', p_opciones: {},
    });
    assert.ok(error, 'la propietaria pudo llamar a evaluar_reserva desde el navegador');
  });
});
