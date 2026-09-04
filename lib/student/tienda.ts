// Qué puede COMPRAR la alumna, leído de lo que el estudio ya tiene configurado.
//
// ⚠️ Sin imports ni `@/`: `node --test --experimental-strip-types` no resuelve
// ese alias, y un test que lo use no falla — deja de ejecutarse.
//
// ⚠️ NO es un catálogo nuevo. Todo sale de dos sitios que YA existen y que YA
// viajan en el payload público:
//
//   · `planes_tarifa`  → suscripciones (MENSUAL), bonos (BONO), sueltas (PUNTUAL)
//   · `citas_servicios` → sesiones y privadas 1:1
//
// Y los precios son los MISMOS que cobra `app/api/public/checkout-embebido`,
// que lee `plan.precio` en servidor. Aquí no se calcula ningún importe: se
// enseña el que existe.
//
// ⚠️ ELEGIBILIDAD. Lo que no se puede comprar no se enseña como comprable:
//   · planes: `activo` — el checkout rechaza un plan apagado (línea 165).
//   · citas:  el payload público ya las filtra por `activo` Y `auto_reservable`,
//     que es la puerta de «vendible online» del estudio. Si alguna vez dejaran
//     de filtrarse ahí, el filtro de aquí las sigue tapando.

export type FamiliaProducto = 'suscripcion' | 'bono' | 'suelta' | 'servicio';

export interface ProductoTienda {
  id: string;
  familia: FamiliaProducto;
  nombre: string;
  descripcion: string | null;
  /** En euros. Nunca calculado aquí: es el del backend. */
  precio: number;
  /** Sesiones que incluye. `null` = ilimitado (mensual) o no aplica. */
  sesiones: number | null;
  /** Días de validez desde la compra. `null` = sin caducidad. */
  validezDias: number | null;
  /** Minutos, solo en servicios y privadas. */
  duracionMin: number | null;
  /** Máximo de clases por semana que permite el plan. `null` = sin tope. */
  limiteSemanal: number | null;
}

export interface PlanTienda {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  tipo?: string | null;
  sesiones?: number | null;
  activo?: boolean | null;
  validezDias?: number | null;
  limiteSemanal?: number | null;
}

export interface ServicioTienda {
  id: string;
  nombre: string;
  descripcion?: string | null;
  precio?: number | null;
  duracionMin?: number | null;
  activo?: boolean | null;
  autoReservable?: boolean | null;
  tipo?: string | null;
}

/** `MENSUAL` → suscripción, `BONO` → paquete, `PUNTUAL` → clase suelta. */
function familiaDePlan(tipo: string | null | undefined): FamiliaProducto | null {
  if (tipo === 'MENSUAL') return 'suscripcion';
  if (tipo === 'BONO') return 'bono';
  if (tipo === 'PUNTUAL') return 'suelta';
  // Un tipo que no conocemos NO se enseña: inventarle una familia sería
  // decidir por el estudio cómo se vende algo que no entendemos.
  return null;
}

function precioValido(p: number | null | undefined): p is number {
  return typeof p === 'number' && Number.isFinite(p) && p > 0;
}

/**
 * El escaparate del estudio, ya ordenado.
 *
 * Orden: suscripciones, bonos, clase suelta y servicios. Es de mayor a menor
 * compromiso, que es como lo lee alguien que está decidiendo — y deja la clase
 * suelta cerca del final, donde sirve de salida y no de primera opción.
 * Dentro de cada familia, de más barato a más caro.
 */
export function catalogoTienda(
  planes: readonly PlanTienda[] | null | undefined,
  servicios: readonly ServicioTienda[] | null | undefined,
): ProductoTienda[] {
  const dePlanes: ProductoTienda[] = (planes ?? [])
    .filter((p) => p.activo !== false)
    .filter((p) => precioValido(p.precio))
    .flatMap((p): ProductoTienda[] => {
      const familia = familiaDePlan(p.tipo);
      // `flatMap` con [] en vez de `map` + `filter`: un tipo desconocido
      // desaparece sin dejar un `null` que luego haya que estrechar.
      if (!familia) return [];
      return [{
        id: p.id,
        familia,
        nombre: p.nombre,
        descripcion: p.descripcion ?? null,
        precio: p.precio as number,
        sesiones: p.sesiones ?? null,
        validezDias: p.validezDias ?? null,
        duracionMin: null,
        limiteSemanal: p.limiteSemanal ?? null,
      }];
    });

  const deServicios: ProductoTienda[] = (servicios ?? [])
    .filter((s) => s.activo !== false)
    // La puerta de «vendible online». Sin esto, una valoración interna que el
    // estudio nunca quiso vender aparecería en el escaparate.
    .filter((s) => s.autoReservable === true)
    .filter((s) => precioValido(s.precio))
    .map((s) => ({
      id: s.id, familia: 'servicio' as const,
      nombre: s.nombre,
      descripcion: s.descripcion ?? null,
      precio: s.precio as number,
      sesiones: null,
      validezDias: null,
      duracionMin: s.duracionMin ?? null,
      limiteSemanal: null,
    }));

  const orden: Record<FamiliaProducto, number> = { suscripcion: 0, bono: 1, suelta: 2, servicio: 3 };
  return [...dePlanes, ...deServicios].sort(
    (a, b) => orden[a.familia] - orden[b.familia] || a.precio - b.precio,
  );
}

/** Títulos de sección, en el mismo orden que `catalogoTienda`. */
export const TITULO_FAMILIA: Record<FamiliaProducto, string> = {
  suscripcion: 'Suscripciones',
  bono: 'Bonos y paquetes',
  suelta: 'Clases sueltas',
  servicio: 'Sesiones y privadas',
};

/**
 * Lo que incluye el producto, en una línea.
 *
 * Se construye solo con datos ciertos: si un bono no declara caducidad no se
 * escribe «sin caducidad» —puede que el estudio la aplique por otra vía— sino
 * que simplemente no se menciona.
 */
export function resumenProducto(p: ProductoTienda): string {
  const partes: string[] = [];
  if (p.familia === 'suscripcion') partes.push(p.sesiones === null ? 'Clases ilimitadas' : `${p.sesiones} clases al mes`);
  else if (p.sesiones !== null) partes.push(`${p.sesiones} ${p.sesiones === 1 ? 'clase' : 'clases'}`);
  if (p.duracionMin) partes.push(`${p.duracionMin} min`);
  if (p.limiteSemanal) partes.push(`máx. ${p.limiteSemanal}/semana`);
  if (p.validezDias) partes.push(`caduca a los ${p.validezDias} días`);
  return partes.join(' · ');
}
