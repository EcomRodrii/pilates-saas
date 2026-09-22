// Clases fijas del estudio, como las ve la alumna: qué ofrece el estudio, qué tiene
// ya ella y qué le falta para pedirla. Puro y sin `@/` (lo leen la pantalla y los
// tests del runner de Node).
//
// ⚠️ Nada de aquí DECIDE. Si tiene o no cuota que la cubra es lo que se le enseña
// antes de pulsar; el servidor lo vuelve a comprobar todo al pedir y otra vez al
// aprobar. Y la fecha «hasta» que se le enseña la calcula el servidor, no el móvil.

import {
  DIAS_AVISO_CLASE_FIJA_TERMINA, estadoAlumnaOferta, franjasYaCubiertas, vigenciaMinDeOferta,
  type CatalogoClasesFijas, type EstadoAlumnaOferta, type FranjaSuelta, type OfertaAlumna,
} from '../clases-fijas-reglas.ts';
import { plazaFijaEnFranja, tieneCuotaQueCubre, type CuotaMin, type PeticionPlazaFijaMin, type PlanCuotaMin, type PlazaFijaEnClase } from './plaza-fija.ts';

export { DIAS_AVISO_CLASE_FIJA_TERMINA };

export interface ClaseFijaVista extends OfertaAlumna {
  /** Lo que ya tiene o ha pedido de esta oferta. */
  estadoAlumna: EstadoAlumnaOferta;
  /** ¿Tiene una cuota activa que cubra TODAS las clases de la oferta? Sin sesión, `true` (no se le riñe). */
  tieneCuota: boolean;
  pedida: { solicitudId: string; duracionMeses: number; hasta: string } | null;
  /** Hasta cuándo le dura (si la tiene entera y con fecha). `null` si no aplica. */
  venceEl: string | null;
  /** Ya ha pedido ampliarla, antes de que venza. */
  ampliacionPedida: { solicitudId: string; duracionMeses: number; hasta: string } | null;
  /**
   * ¿Falta poco para que venza (dentro de `DIAS_AVISO_CLASE_FIJA_TERMINA`)?
   * Se calcula aquí, con el mismo `hoy` que `venceEl` y el resto de campos —
   * mismo criterio que ellos: la pantalla nunca vuelve a llamar a
   * `hoyEnEstudio()` por su cuenta, lee lo que ya viene resuelto.
   */
  terminaPronto: boolean;
}

export interface SociaMin {
  suscripciones: CuotaMin[];
  plazasFijas: { diaSemana: number; horaInicio: string; salaId: string; tipoClaseId: string | null; estado: string; vigenciaHasta: string | null }[];
  /** Solo hace falta para las sueltas (`proyectarClasesSueltas`): las ofertas tienen sus propias peticiones (`pedidas`). */
  peticionesPlazaFija?: PeticionPlazaFijaMin[];
}

export function proyectarClasesFijas(
  cat: CatalogoClasesFijas | null, socia: SociaMin | null, planes: PlanCuotaMin[], hoy: string,
): ClaseFijaVista[] {
  if (!cat || !Array.isArray(cat.ofertas)) return [];
  const pedidas = Array.isArray(cat.pedidas) ? cat.pedidas : [];
  return cat.ofertas.map((o) => {
    const p = pedidas.find((x) => x.claseFijaId === o.id && x.tipo === 'CREAR_CLASE_FIJA') ?? null;
    const a = pedidas.find((x) => x.claseFijaId === o.id && x.tipo === 'AMPLIAR_CLASE_FIJA') ?? null;
    const yaTiene = socia ? franjasYaCubiertas(o.franjas.map((f) => ({ ...f, tipoClaseId: f.tipoClaseId })), socia.plazasFijas, hoy).length : 0;
    const venceEl = socia ? vigenciaMinDeOferta(o.franjas, socia.plazasFijas, hoy) : null;
    return {
      ...o,
      estadoAlumna: estadoAlumnaOferta({ franjas: o.franjas.length, yaTiene, pedida: !!p }),
      tieneCuota: socia
        ? o.franjas.every((f) => tieneCuotaQueCubre(socia.suscripciones, planes, hoy, f.tipoClaseId))
        : true,
      pedida: p ? { solicitudId: p.solicitudId, duracionMeses: p.duracionMeses, hasta: p.hasta } : null,
      venceEl,
      ampliacionPedida: a ? { solicitudId: a.solicitudId, duracionMeses: a.duracionMeses, hasta: a.hasta } : null,
      terminaPronto: terminaPronto(venceEl, hoy),
    };
  });
}

export interface ClaseSueltaVista extends FranjaSuelta {
  estado: PlazaFijaEnClase;
}

/**
 * Las clases sueltas (sin oferta con nombre) que ya se repiten, con lo que ella
 * ya tiene o ha pedido de cada una. Mismo criterio que la ficha de una clase:
 * sin sesión de alumna, se le ofrece pedirla (no se la riñe por su cuota).
 */
export function proyectarClasesSueltas(
  sueltas: FranjaSuelta[], socia: SociaMin | null, planes: PlanCuotaMin[], hoy: string,
): ClaseSueltaVista[] {
  return sueltas.map((f) => ({
    ...f,
    estado: plazaFijaEnFranja(
      f, socia?.plazasFijas ?? [], socia?.peticionesPlazaFija ?? [],
      socia ? tieneCuotaQueCubre(socia.suscripciones, planes, hoy, f.tipoClaseId) : true,
    ),
  }));
}

/** ¿Falta poco para que venza? A partir de aquí la pantalla ofrece ampliarla. */
export function terminaPronto(venceEl: string | null, hoy: string): boolean {
  if (!venceEl) return false;
  const dias = Math.round((Date.parse(venceEl) - Date.parse(hoy)) / 86_400_000);
  return dias >= 0 && dias <= DIAS_AVISO_CLASE_FIJA_TERMINA;
}

/** «martes y jueves», «lunes, miércoles y viernes»: los días de la oferta, sin repetir. */
export function diasDeLaOferta(franjas: { diaSemana: number }[]): string {
  const NOMBRES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const dias = [...new Set(franjas.map((f) => f.diaSemana))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => NOMBRES[d] ?? '');
  if (dias.length <= 1) return dias[0] ?? '';
  return `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
}
