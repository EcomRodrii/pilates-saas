// Clases fijas del estudio, como las ve la alumna: qué ofrece el estudio, qué tiene
// ya ella y qué le falta para pedirla. Puro y sin `@/` (lo leen la pantalla y los
// tests del runner de Node).
//
// ⚠️ Nada de aquí DECIDE. Si tiene o no cuota que la cubra es lo que se le enseña
// antes de pulsar; el servidor lo vuelve a comprobar todo al pedir y otra vez al
// aprobar. Y la fecha «hasta» que se le enseña la calcula el servidor, no el móvil.

import {
  estadoAlumnaOferta, franjasYaCubiertas,
  type CatalogoClasesFijas, type EstadoAlumnaOferta, type OfertaAlumna,
} from '../clases-fijas-reglas.ts';
import { tieneCuotaQueCubre, type CuotaMin, type PlanCuotaMin } from './plaza-fija.ts';

export interface ClaseFijaVista extends OfertaAlumna {
  /** Lo que ya tiene o ha pedido de esta oferta. */
  estadoAlumna: EstadoAlumnaOferta;
  /** ¿Tiene una cuota activa que cubra TODAS las clases de la oferta? Sin sesión, `true` (no se le riñe). */
  tieneCuota: boolean;
  pedida: { solicitudId: string; duracionMeses: number; hasta: string } | null;
}

export interface SociaMin {
  suscripciones: CuotaMin[];
  plazasFijas: { diaSemana: number; horaInicio: string; salaId: string; tipoClaseId: string | null; estado: string; vigenciaHasta: string | null }[];
}

export function proyectarClasesFijas(
  cat: CatalogoClasesFijas | null, socia: SociaMin | null, planes: PlanCuotaMin[], hoy: string,
): ClaseFijaVista[] {
  if (!cat || !Array.isArray(cat.ofertas)) return [];
  const pedidas = Array.isArray(cat.pedidas) ? cat.pedidas : [];
  return cat.ofertas.map((o) => {
    const p = pedidas.find((x) => x.claseFijaId === o.id) ?? null;
    const yaTiene = socia ? franjasYaCubiertas(o.franjas.map((f) => ({ ...f, tipoClaseId: f.tipoClaseId })), socia.plazasFijas, hoy).length : 0;
    return {
      ...o,
      estadoAlumna: estadoAlumnaOferta({ franjas: o.franjas.length, yaTiene, pedida: !!p }),
      tieneCuota: socia
        ? o.franjas.every((f) => tieneCuotaQueCubre(socia.suscripciones, planes, hoy, f.tipoClaseId))
        : true,
      pedida: p ? { solicitudId: p.solicitudId, duracionMeses: p.duracionMeses, hasta: p.hasta } : null,
    };
  });
}

/** «martes y jueves», «lunes, miércoles y viernes»: los días de la oferta, sin repetir. */
export function diasDeLaOferta(franjas: { diaSemana: number }[]): string {
  const NOMBRES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const dias = [...new Set(franjas.map((f) => f.diaSemana))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => NOMBRES[d] ?? '');
  if (dias.length <= 1) return dias[0] ?? '';
  return `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
}
