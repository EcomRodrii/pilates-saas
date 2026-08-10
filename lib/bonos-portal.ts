// Lo que la pantalla de Bonos dice con datos, fuera del JSX.
//
// El diseño enseña UN bono: «Bono 10 · Reformer», «8 de 10 sesiones
// disponibles», una barra al 80 %, cuándo caduca y lo que costó. Nada de eso
// está guardado tal cual: la suscripción trae `sesionesRestantes` y el plan trae
// `sesiones`, y el resto se deduce. Por eso vive aquí y con tests: una barra de
// progreso que miente sobre el saldo de un bono pagado es de las peores cosas
// que puede hacer esta pantalla.

import type { PlanTarifa, PlazaFija, Sala, Suscripcion, TipoClase } from './types.ts';
import { calcularEstadoSuscripcion, textoCaducidad } from './suscripcion-estado.ts';

export interface BonoActivo {
  suscripcionId: string;
  /** «Bono 10 · Reformer» — el tipo solo se añade si el bono está acotado a uno. */
  nombre: string;
  restantes: number | null;
  total: number | null;
  /** 0..1 para la barra. null cuando el plan no cuenta sesiones (mensual). */
  progreso: number | null;
  caducaEn: string | null;
  precio: number | null;
  esMensual: boolean;
  /**
   * «Caduca en 18 días» (bono) / «Próxima renovación en 6 días» (mensual) —
   * mismo cálculo (`lib/suscripcion-estado.ts`) que la ficha de la clienta en
   * el panel, para que socia y estudio nunca vean una cuenta de días distinta.
   * `null` cuando la suscripción no tiene `fecha_fin` (sin caducidad/mensual
   * aún no renovado por Stripe/mostrador).
   */
  textoCaducidad: string | null;
  /** ≤3 días o ≤2 sesiones — mismo umbral que ya resalta el badge del panel. */
  urgente: boolean;
  /** Solo aplica a bonos: `fecha_fin` ya pasada. Un mensual nunca "caduca", renueva. */
  caducado: boolean;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** «30 de septiembre» — sin año si es el corriente, que es el 99 % de los casos. */
export function fechaLarga(iso: string, hoy = new Date()): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return '';
  const texto = `${d} de ${MESES[m - 1]}`;
  return a === hoy.getFullYear() ? texto : `${texto} de ${a}`;
}

/**
 * El bono que la socia está usando. Si tiene varios activos —pasa: un mensual y
 * un bono de reformer— gana el que **caduca antes**, que es el que le urge
 * gastar. Con empate, el de menos sesiones restantes.
 */
export function bonoActivo(
  suscripciones: Suscripcion[], planes: PlanTarifa[], tiposClase: TipoClase[], socioId: string | null,
): BonoActivo | null {
  if (!socioId) return null;

  const candidatas = suscripciones
    .filter(s => s.socioId === socioId && s.estado === 'ACTIVA')
    .map(s => ({ s, plan: planes.find(p => p.id === s.planId) ?? null }))
    .filter(x => x.plan !== null);
  if (candidatas.length === 0) return null;

  candidatas.sort((a, b) => {
    const fa = a.s.fechaFin ?? '9999-12-31';
    const fb = b.s.fechaFin ?? '9999-12-31';
    if (fa !== fb) return fa < fb ? -1 : 1;
    return (a.s.sesionesRestantes ?? Infinity) - (b.s.sesionesRestantes ?? Infinity);
  });

  const { s, plan } = candidatas[0];
  const total = plan!.sesiones ?? null;
  const restantes = s.sesionesRestantes ?? null;
  // Los tipos acotados (0111) son lo que convierte «Bono 10» en «Bono 10 ·
  // Reformer». Con más de uno no se enumeran: el título se iría de ancho.
  const tipos = plan!.tiposClaseIds ?? [];
  const nombreTipo = tipos.length === 1
    ? tiposClase.find(tc => tc.id === tipos[0])?.nombre ?? null
    : null;

  const estado = calcularEstadoSuscripcion(s, plan);
  const urgente = estado.kind === 'bono' ? estado.urgente : estado.kind === 'recurrente' ? estado.urgente : false;
  const caducado = estado.kind === 'bono' && estado.caducado;

  return {
    suscripcionId: s.id,
    nombre: nombreTipo ? `${plan!.nombre} · ${nombreTipo}` : plan!.nombre,
    restantes,
    total,
    // Sin total no hay barra: un mensual ilimitado no tiene fracción que pintar,
    // y dibujarla al 100 % sugeriría que se ha gastado todo.
    progreso: total && total > 0 && restantes != null
      ? Math.max(0, Math.min(1, restantes / total))
      : null,
    caducaEn: s.fechaFin,
    precio: plan!.precio ?? null,
    esMensual: plan!.tipo === 'MENSUAL',
    textoCaducidad: textoCaducidad(estado),
    urgente,
    caducado,
  };
}

/** La plaza fija vigente, ya en el lenguaje de la pantalla. */
export function plazaFijaTexto(
  plazas: PlazaFija[], socioId: string | null, salas: Sala[], tiposClase: TipoClase[],
): { cuando: string; donde: string } | null {
  if (!socioId) return null;
  const p = plazas.find(x => x.socioId === socioId && x.estado === 'ACTIVA');
  if (!p) return null;

  const hora = p.horaInicio.slice(0, 5);
  const sala = salas.find(s => s.id === p.salaId)?.nombre ?? null;
  const tipo = p.tipoClaseId ? tiposClase.find(t => t.id === p.tipoClaseId)?.nombre ?? null : null;
  // El número de plaza es lo que la hace SUYA («mi reformer»), así que si está,
  // va. `spotId` es opcional: una sala de mat no numera.
  const partes = [tipo, sala].filter(Boolean) as string[];

  return {
    cuando: `${DIAS[p.diaSemana] ?? ''} · ${hora}`.trim(),
    donde: partes.join(' · '),
  };
}
