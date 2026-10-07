// ─────────────────────────────────────────────────────────────────────────────
// Calculadora de la escalera de precios de un estudio (/recursos/bonos-de-pilates).
//
// Parte del precio de la clase suelta y de un descuento por escalón, y devuelve
// el precio de cada producto, lo que sale cada sesión y el ahorro frente a la
// suelta. Avisa de los dos errores que explica el artículo: un escalón por
// debajo de tu coste por plaza, y un bono de 10 más barato por sesión que la
// cuota (empuja a las alumnas fuera de la cuota).
//
// Los descuentos de partida son las medianas de nuestra muestra de 32 estudios
// (25-sep-2026): bono de 5, 14 %; bono de 10, 21 %; cuota de una clase semanal,
// 20 % por sesión frente a la suelta; y pasar a dos clases, otro 16 %.
// Pura y sin `@/`: se prueba con node --test.
// ─────────────────────────────────────────────────────────────────────────────

export interface EntradaBonos {
  /** Precio de la clase suelta (€). */
  suelta: number;
  /** Descuento por sesión frente a la suelta, en %. */
  descuentoBono5: number;
  descuentoBono10: number;
  descuentoCuota1: number;
  /** Rebaja adicional por sesión al pasar de 1 a 2 clases a la semana, en %. */
  descuentoCuota2: number;
  /** Lo que te cuesta una plaza ocupada (€). 0 = no avisar. */
  costePorPlaza: number;
}

export interface Escalon {
  id: 'suelta' | 'bono5' | 'bono10' | 'cuota1' | 'cuota2';
  nombre: string;
  /** Precio del producto (€; en las cuotas, al mes). */
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
    cuota2: suelta * (1 - pct(e.descuentoCuota1)) * (1 - pct(e.descuentoCuota2)),
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
      porDebajoDelCoste: coste > 0 && ps < coste,
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
