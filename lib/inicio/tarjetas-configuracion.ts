// ─────────────────────────────────────────────────────────────────────────────
// Las tarjetas del Inicio de configuración (24-nov-2026, `SHELL_NUEVO`): la lista de pasos de
// puesta en marcha (`lib/guia/ruta-puesta-en-marcha.ts`) como una rejilla de tarjetas, igual que
// la home de Shopify antes de configurar la tienda. Puro, sin `@/`.
//
// NO decide qué está hecho: lo dice la ruta (datos reales del estudio). Aquí solo se agrupan los
// pasos en tarjetas: las dos reglas (reserva y cancelación) son UNA tarjeta con «N de 2 tareas», como
// «Prepara tu tienda para el derecho de desistimiento» en Shopify; el resto, un paso por tarjeta.
// ─────────────────────────────────────────────────────────────────────────────
import { hrefPaso, type BotonPaso, type IdPaso, type PasoConEstado, type RutaPuestaEnMarcha } from '../guia/ruta-puesta-en-marcha.ts';

export type IdTarjetaInicio =
  | 'estudio' | 'salas' | 'instructoras' | 'tipos' | 'reglas' | 'tarifas' | 'cobros' | 'horario' | 'alumnas' | 'marca' | 'lanzamiento';

export type EstadoTarjeta = 'hecha' | 'ahora' | 'pendiente' | 'saltada' | 'bloqueada';

export interface TarjetaInicio {
  id: IdTarjetaInicio;
  titulo: string;
  texto: string;
  estado: EstadoTarjeta;
  /** El botón de la tarjeta: lleva a su pantalla o abre «Compartir mi enlace» ahí mismo. */
  boton: BotonPaso;
  /** «0 de 2 tareas completadas», solo cuando la tarjeta tiene subtareas. */
  tareas?: { hechas: number; total: number };
  minutos?: number;
  /** Los pasos de la ruta que se pueden saltar desde la × de la tarjeta (todos o ninguno). */
  saltables: IdPaso[];
}

const BOTON_DE_REGLAS: BotonPaso = { label: 'Revisar reglas', href: '/configuracion?tab=reservas' };

/** Qué dice el botón de cada paso cuando ya está hecho. */
const BOTON_HECHO = 'Revisar';

function estadoDe(p: PasoConEstado): EstadoTarjeta {
  switch (p.estado) {
    case 'hecho': return 'hecha';
    case 'ahora': return 'ahora';
    case 'saltado': return 'saltada';
    case 'bloqueado': return 'bloqueada';
    default: return 'pendiente';
  }
}

export function tarjetasDeConfiguracion(ruta: RutaPuestaEnMarcha): TarjetaInicio[] {
  const tarjetas: TarjetaInicio[] = [];
  const reglas = ruta.pasos.filter(p => p.id === 'reglas-reserva' || p.id === 'reglas-cancelacion');
  for (const p of ruta.pasos) {
    if (p.id === 'reglas-reserva') {
      const revisadas = reglas.filter(r => r.estado === 'saltado').length;
      tarjetas.push({
        id: 'reglas',
        titulo: 'Decide cómo se reserva y se cancela',
        texto: 'Con cuánta antelación se reserva, qué pasa si la clase se llena y hasta cuándo se cancela gratis.',
        estado: revisadas === reglas.length ? 'hecha' : 'pendiente',
        boton: BOTON_DE_REGLAS,
        tareas: { hechas: revisadas, total: reglas.length },
        minutos: reglas.reduce((t, r) => t + (r.minutos ?? 0), 0) || undefined,
        saltables: reglas.map(r => r.id),
      });
      continue;
    }
    if (p.id === 'reglas-cancelacion') continue;
    const boton: BotonPaso = p.estado === 'hecho' && p.boton && 'href' in p.boton
      ? { label: BOTON_HECHO, href: p.boton.href }
      : p.estado === 'bloqueado' ? { label: 'Ver qué falta', href: hrefPaso(p.id) } : p.boton ?? { label: 'Empezar', href: hrefPaso(p.id) };
    tarjetas.push({
      id: p.id as IdTarjetaInicio,
      titulo: p.titulo,
      texto: p.que,
      estado: estadoDe(p),
      boton,
      minutos: p.minutos,
      saltables: p.saltable && p.estado !== 'hecho' ? [p.id] : [],
    });
  }
  return tarjetas;
}

/**
 * La columna de cada tarjeta en la rejilla de 6 (cada tarjeta ocupa 2): la última fila, si queda corta, va
 * centrada, como en Shopify (una sola tarjeta → columnas 3-4; dos → 2-3 y 4-5).
 */
export function columnaDeTarjeta(indice: number, total: number): number | null {
  const enUltima = total % 3 || 3;
  const primeraDeUltima = total - enUltima;
  if (indice < primeraDeUltima || enUltima === 3) return null;
  return enUltima === 1 ? 3 : 2 + (indice - primeraDeUltima) * 2;
}

/** «0 de 2 tareas completadas» (singular: «1 tarea»). */
export function textoTareas(t: { hechas: number; total: number }): string {
  return `${t.hechas} de ${t.total} tareas completadas`;
}
