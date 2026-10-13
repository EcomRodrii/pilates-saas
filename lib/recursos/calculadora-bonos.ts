// ─────────────────────────────────────────────────────────────────────────────
// Calculadora de la escalera de precios de un estudio (/recursos/bonos-de-pilates).
//
// Parte del precio de la clase suelta y de un descuento por escalón (todos por
// sesión y frente a la suelta), y devuelve el precio de cada producto, lo que
// sale cada sesión y el ahorro. Avisa de los dos errores que explica el
// artículo: un escalón por debajo de tu coste por plaza, y un bono de 10 más
// barato por sesión que la cuota (empuja a las alumnas fuera de la cuota).
//
// Los precios llevan IVA (es lo que publican los estudios) y el coste por plaza
// no (es lo que calcula la guía de rentabilidad): para comparar, al precio se le
// quita el 21 % antes. Comparar los dos tal cual daba por bueno un escalón que
// no cubre el coste.
//
// Los valores de partida son el ejemplo de la tabla del artículo (medianas de
// reformer en grupo, 25-sep-2026): 25 € la suelta, bonos al 12 % y al 20 %,
// cuotas de 75 € y 130 € al mes.
// Pura y sin `@/`: se prueba con node --test.
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaBonos {
  /** Precio de la clase suelta (€). */
  suelta: number;
  /** Descuento por sesión frente a la suelta, en %. */
  descuentoBono5: number;
  descuentoBono10: number;
  descuentoCuota1: number;
  descuentoCuota2: number;
  /** Lo que te cuesta una plaza ocupada, SIN IVA (€). 0 = no avisar. */
  costePorPlaza: number;
}

export interface Escalon {
  id: 'suelta' | 'bono5' | 'bono10' | 'cuota1' | 'cuota2';
  nombre: string;
  /** Precio del producto, con IVA (€; en las cuotas, al mes). */
  precio: number;
  sesiones: number;
  porSesion: number;
  /** Ahorro por sesión frente a la suelta, en %. */
  ahorro: number;
  porDebajoDelCoste: boolean;
}

export interface ResultadoBonos {
  escalones: Escalon[];
  /** El bono de 10 sale más barato por sesión que la cuota de una clase semanal. */
  bonoCanibalizaCuota: boolean;
}

/** Semanas de cuatro clases al mes: la cuenta que enseñan los propios estudios (80 €/mes = 20 €/clase). */
const SESIONES_CUOTA_1 = 4;
const SESIONES_CUOTA_2 = 8;
/** IVA de una clase en un estudio privado (lib/recursos/articulos/iva-clases-de-pilates.ts). */
export const IVA_CLASES = 0.21;

const pct = (n: number) => Math.min(95, Math.max(0, Number.isFinite(n) ? n : 0)) / 100;
const positivo = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const redondea = (n: number) => Math.round(n * 100) / 100;

export function calcularBonos(e: EntradaBonos): ResultadoBonos {
  const suelta = positivo(e.suelta);
  const coste = positivo(e.costePorPlaza);
  const porSesion = {
    suelta,
    bono5: suelta * (1 - pct(e.descuentoBono5)),
    bono10: suelta * (1 - pct(e.descuentoBono10)),
    cuota1: suelta * (1 - pct(e.descuentoCuota1)),
    cuota2: suelta * (1 - pct(e.descuentoCuota2)),
  };
  const fila = (id: Escalon['id'], nombre: string, sesiones: number): Escalon => {
    const ps = redondea(porSesion[id]);
    return {
      id,
      nombre,
      sesiones,
      porSesion: ps,
      precio: redondea(ps * sesiones),
      ahorro: suelta > 0 ? Math.round((1 - ps / suelta) * 100) : 0,
      porDebajoDelCoste: coste > 0 && ps / (1 + IVA_CLASES) < coste,
    };
  };
  const escalones = [
    fila('suelta', 'Clase suelta', 1),
    fila('bono5', 'Bono de 5 sesiones', 5),
    fila('bono10', 'Bono de 10 sesiones', 10),
    fila('cuota1', 'Cuota de 1 clase a la semana', SESIONES_CUOTA_1),
    fila('cuota2', 'Cuota de 2 clases a la semana', SESIONES_CUOTA_2),
  ];
  return { escalones, bonoCanibalizaCuota: porSesion.bono10 < porSesion.cuota1 };
}
