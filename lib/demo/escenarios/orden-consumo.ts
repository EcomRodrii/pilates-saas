// Escenario «orden_consumo_bonos»: la alumna tiene varios bonos y reserva una
// clase. ¿De cuál se descuenta la sesión?
//
// ⚠️ Lo decide `bonoConsumible` (lib/bono-logic.ts), el mismo que usa el
// servidor. Su gemela en SQL es `elegir_bono_consumible`: orden fijo, sin azar.
import { z } from 'zod';
import type { PlanTarifa, Suscripcion } from '../../types.ts';
import { bonoConsumible } from '../../bono-logic.ts';
import type { Comprobacion, DemoGenerada, PasoDemo } from '../modelo.ts';
import { CONTEXTO_POR_DEFECTO, type ContextoDemo } from '../centros.ts';
import { LUNES_DEMO, etiquetaFecha, sumarDias } from '../fechas.ts';

const bono = z.strictObject({
  alcance: z.enum(['todas', 'solo_esta_clase', 'solo_otra_clase']),
  caducaEnDias: z.number().int().min(0).max(120).nullable(),
  restantes: z.number().int().min(0).max(20),
});

export const parametros = z.strictObject({
  bonos: z.array(bono).min(2).max(3).default([
    { alcance: 'todas', caducaEnDias: 5, restantes: 6 },
    { alcance: 'solo_esta_clase', caducaEnDias: 30, restantes: 4 },
  ]),
  tieneCuotaMensualQueCubre: z.boolean().default(false),
});
export type Parametros = z.infer<typeof parametros>;

const NOMBRES = ['Bono A', 'Bono B', 'Bono C'] as const;
const ALCANCE_TEXTO = {
  todas: 'vale para todas las clases',
  solo_esta_clase: 'solo para este tipo de clase',
  solo_otra_clase: 'solo para otro tipo de clase',
} as const;

export function generar(p: Parametros, ctx: ContextoDemo = CONTEXTO_POR_DEFECTO): DemoGenerada {
  const planes: PlanTarifa[] = p.bonos.map((b, i) => ({
    id: `plan-${i}`, studioId: 'demo', nombre: NOMBRES[i], descripcion: null, precio: 0, tipo: 'BONO', sesiones: 20,
    validezDias: null, activo: true,
    tiposClaseIds: b.alcance === 'todas' ? [] : [b.alcance === 'solo_esta_clase' ? 'clase-a' : 'clase-b'],
  } as unknown as PlanTarifa));
  const subs: Suscripcion[] = p.bonos.map((b, i) => ({
    id: `sus-${i}`, studioId: 'demo', socioId: 'alumna-demo', planId: `plan-${i}`, estado: 'ACTIVA',
    fechaInicio: LUNES_DEMO, fechaFin: b.caducaEnDias === null ? null : sumarDias(LUNES_DEMO, b.caducaEnDias),
    sesionesRestantes: b.restantes, stripeSubscriptionId: null,
  }));
  if (p.tieneCuotaMensualQueCubre) {
    planes.push({ id: 'plan-mensual', studioId: 'demo', nombre: 'Cuota mensual', descripcion: null, precio: 0, tipo: 'MENSUAL', sesiones: null, activo: true, tiposClaseIds: [] } as unknown as PlanTarifa);
    subs.push({ id: 'sus-mensual', studioId: 'demo', socioId: 'alumna-demo', planId: 'plan-mensual', estado: 'ACTIVA', fechaInicio: LUNES_DEMO, fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null });
  }
  const elegido = bonoConsumible('alumna-demo', subs, planes, LUNES_DEMO, 'clase-a');
  const nombreElegido = elegido ? NOMBRES[Number(elegido.suscripcion.id.split('-')[1])] : null;

  // Verificación independiente (no repite el código del producto: lo comprueba desde fuera).
  const candidatos = p.bonos.map((b, i) => ({ b, i })).filter(({ b }) => b.restantes > 0 && b.alcance !== 'solo_otra_clase');
  const rango = (b: (typeof p.bonos)[number]) => [b.alcance === 'todas' ? 1 : 0, b.caducaEnDias ?? 9999] as const;
  candidatos.sort((x, y) => (rango(x.b)[0] - rango(y.b)[0]) || (rango(x.b)[1] - rango(y.b)[1]) || (x.i - y.i));
  const esperado = p.tieneCuotaMensualQueCubre ? null : candidatos[0] ? NOMBRES[candidatos[0].i] : null;

  const regla = {
    mensual: { texto: 'Si una cuota mensual cubre la clase, no se descuenta ninguna sesión de bono.', fuente: 'bonoConsumible: la mensual gana' },
    cobertura: { texto: 'Un bono limitado a otro tipo de clase, o sin sesiones, o caducado, no compite.', fuente: 'planCubreTipoClase · restantes > 0 · fechaFin >= hoy' },
    orden: { texto: 'Entre los que sirven: primero el limitado a ciertos tipos de clase; después el que caduca antes; por último, un orden fijo.', fuente: 'elegir_bono_consumible (SQL) = bonoConsumible (TS)' },
  };

  const filaBono = (b: (typeof p.bonos)[number], i: number) => ({
    k: NOMBRES[i], v: `${b.restantes} ${b.restantes === 1 ? 'sesión' : 'sesiones'} · ${ALCANCE_TEXTO[b.alcance]} · ${b.caducaEnDias === null ? 'no caduca' : `caduca el ${etiquetaFecha(sumarDias(LUNES_DEMO, b.caducaEnDias))}`}`,
  });

  // Los bonos de la clienta de ejemplo en la ficha REAL del panel, antes y después de reservar (lib/demo/panel).
  const bonosPanel = (descontarDe: number | null) => p.bonos.map((b, i) => ({
    nombre: `${NOMBRES[i]} · ${ALCANCE_TEXTO[b.alcance]}`,
    restantes: i === descontarDe ? Math.max(0, b.restantes - 1) : b.restantes,
    total: Math.max(b.restantes, 10),
    caducaEnDias: b.caducaEnDias,
  }));
  const saldoTotal = p.bonos.reduce((n, b) => n + b.restantes, 0);
  const indiceElegido = elegido ? Number(elegido.suscripcion.id.split('-')[1]) : null;

  const pasos: PasoDemo[] = [
    {
      pantalla: { ruta: '/clientas/soc-1', bonos: bonosPanel(null), titular: 'Los bonos de la alumna', detalle: `Tiene ${p.bonos.length} bonos vivos a la vez${p.tieneCuotaMensualQueCubre ? ' y una cuota mensual' : ''}. La ficha suma lo que le queda en todos: ${saldoTotal} sesiones.` },
      id: 'bonos', titulo: 'Los bonos de la alumna',
      proposito: 'Una alumna puede tener varios bonos vivos a la vez. Este es su estado.',
      bloques: [{ tipo: 'tabla', filas: [...p.bonos.map(filaBono), ...(p.tieneCuotaMensualQueCubre ? [{ k: 'Cuota mensual', v: 'Activa y cubre esta clase' }] : [])] }],
      porQue: [regla.cobertura],
    },
    {
      pantalla: { ruta: '/clientas/soc-1', bonos: bonosPanel(null), titular: 'Reserva una clase', detalle: `Al reservar, Tentare elige de qué bono sale la sesión. Ahora la ficha suma ${saldoTotal} sesiones.` },
      id: 'reserva', titulo: 'Reserva una clase',
      proposito: 'Al reservar, Tentare elige de qué bono sale la sesión.',
      bloques: [{ tipo: 'texto', texto: `Reserva ${ctx.clase} el ${etiquetaFecha(LUNES_DEMO)}.` }],
      porQue: [regla.mensual, regla.cobertura, regla.orden],
    },
    {
      pantalla: { ruta: '/clientas/soc-1', bonos: bonosPanel(indiceElegido), titular: nombreElegido ? `Se descuenta de ${nombreElegido}` : p.tieneCuotaMensualQueCubre ? 'No se descuenta ninguna sesión' : 'Ningún bono sirve para esta clase', detalle: nombreElegido ? `Se descuenta de ${nombreElegido} y la ficha, que suma todos los bonos, baja de ${saldoTotal} a ${saldoTotal - 1}.` : p.tieneCuotaMensualQueCubre ? 'La cuota mensual cubre la clase.' : 'La alumna no podría reservar con bono.' },
      id: 'resultado', titulo: 'De cuál se descuenta',
      proposito: 'El resultado es siempre el mismo para los mismos datos.',
      bloques: [
        { tipo: 'resultado',
          titular: nombreElegido ? `Se descuenta de ${nombreElegido}` : p.tieneCuotaMensualQueCubre ? 'No se descuenta ninguna sesión' : 'Ningún bono sirve para esta clase',
          detalle: nombreElegido ? `Le quedarán ${(elegido?.sesionesRestantes ?? 1) - 1} en ese bono.` : p.tieneCuotaMensualQueCubre ? 'La cuota mensual cubre la clase.' : 'La alumna no podría reservar con bono.',
          tono: nombreElegido || p.tieneCuotaMensualQueCubre ? 'ok' : 'aviso' },
      ],
      porQue: [regla.orden, regla.mensual],
    },
  ];

  const comprobaciones: Comprobacion[] = [
    { id: 'orden-documentado', descripcion: 'El bono elegido coincide con el orden documentado (específico, luego el que caduca antes).', ok: nombreElegido === esperado },
    { id: 'mensual-gana', descripcion: 'Con cuota mensual que cubre, no se elige ningún bono.', ok: !p.tieneCuotaMensualQueCubre || elegido === null },
  ];

  return {
    escenario: 'orden_consumo_bonos',
    titulo: 'De qué bono se descuenta la sesión',
    objetivo: 'Entender qué bono gasta Tentare cuando una alumna tiene varios y reserva una clase.',
    modulos: ['Planes y bonos', 'Reservas'],
    reglasAplicables: [regla.mensual, regla.cobertura, regla.orden],
    entidades: [
      { tipo: 'Alumna', descripcion: `Alumna de ejemplo de ${ctx.estudio} con varios bonos.` },
      ...p.bonos.map((_, i) => ({ tipo: NOMBRES[i], descripcion: filaBono(p.bonos[i], i).v })),
    ],
    estadoInicial: `${p.bonos.length} bonos vivos${p.tieneCuotaMensualQueCubre ? ' y una cuota mensual' : ''}.`,
    acciones: ['Reservar una clase'],
    resultadoEsperado: nombreElegido ? `Se descuenta de ${nombreElegido}.` : 'No se descuenta ninguna sesión.',
    pasos,
    excepciones: ['Un bono agotado (0 sesiones) no compite aunque caduque antes.', 'Con el mismo tipo y la misma fecha, decide el identificador: siempre el mismo.'],
    comprobaciones,
  };
}
