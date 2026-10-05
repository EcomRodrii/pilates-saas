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

// Relativo y con `.ts` explícita, que es lo que sí resuelve el runner de
// `node --test` — la advertencia de arriba es sobre `@/`, no sobre compartir
// código. Y compartir aquí importa: el nombre del periodo lo decide un solo
// sitio para el panel y para el escaparate.
import { cicloInicialDe, nombrePeriodo } from '../bono-logic.ts';
import { ahorroPorcentaje } from '../reservar/ahorro-plan.ts';
import { precioEnEuros } from '../reservar/tarjeta-plan.ts';

export type FamiliaProducto = 'suscripcion' | 'bono' | 'suelta' | 'servicio' | 'producto';

/** Lo que el servidor manda de un producto físico. Ya filtrado y acotado allí. */
export interface ProductoFisicoTienda {
  id: string;
  nombre: string;
  precio: number | null;
  descripcion: string | null;
  imagenUrl: string | null;
}

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
  /**
   * Foto, solo en productos físicos. `null` = sin foto, que hoy es lo normal.
   *
   * La URL se pasa TAL CUAL: lleva un `?v=<timestamp>` que rompe el caché
   * cuando el estudio sustituye la imagen conservando la ruta.
   */
  imagenUrl: string | null;
  /**
   * Cada cuántos meses se cobra una suscripción: 1, 3, 6 o 12. `null` en todo
   * lo que no es una suscripción.
   *
   * Sin esto, el escaparate ponía «/mes» debajo de TODA suscripción, también
   * de una que se cobra por trimestres: la alumna leería 180 €/mes donde el
   * estudio cobra 180 € cada tres meses, y decidiría sobre un precio que no
   * existe.
   */
  periodicidadMeses: number | null;
  /**
   * Tipos de clase a los que está ACOTADO (`plan_tipos_clase`). Vacío = sirve
   * para todas, que es la regla del servidor (`cubreTipo`, bono-cubre.ts).
   */
  tiposClaseIds: string[];
  /**
   * Techo semanal POR ACTIVIDAD, ya filtrado a los topes reales (> 0).
   *
   * ⚠️ Viajaba hasta el cliente y NADIE se lo contaba a la alumna: el
   * escaparate enseñaba solo `limiteSemanal` («máx. 3/semana») donde el
   * servidor entiende «2 de Máquina y 1 de Gyrotonic». Es literalmente lo que
   * la migración que lo creó dice que hay que impedir, y la alumna lo
   * descubría al reservar la tercera de Máquina, con un `LIMITE_SEMANAL_
   * ACTIVIDAD` y el dinero ya pagado: una condición de venta que solo aparece
   * después de comprar.
   */
  limitePorTipo: Record<string, number>;
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
  periodicidadMeses?: number | null;
  tiposClaseIds?: string[] | null;
  /** La «clase de prueba» no se vende en la tienda (lib/billing/clase-prueba.ts). */
  esPrueba?: boolean | null;
  /** Techo semanal POR ACTIVIDAD (`plan_tipos_clase.limite_semanal`, migr 20260907030553). */
  limitePorTipo?: Record<string, number | null> | null;
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

/**
 * ¿Este plan se cobra otra vez? Lo pregunta el escaparate para poner «/mes» y,
 * desde el arreglo de la hoja de compra, también la hoja — que es la ÚLTIMA
 * pantalla antes de pagar y decía «89 €» a secas donde la tienda decía
 * «89 €/mes». Un cobro recurrente presentado como pago único, justo al
 * confirmar. La regla vive en un sitio para que no vuelvan a divergir.
 */
export function esSuscripcion(tipo: string | null | undefined): boolean {
  return familiaDePlan(tipo) === 'suscripcion';
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
  productos?: readonly ProductoFisicoTienda[] | null,
): ProductoTienda[] {
  const dePlanes: ProductoTienda[] = (planes ?? [])
    .filter((p) => p.activo !== false)
    .filter((p) => p.esPrueba !== true)
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
        // Solo los topes de verdad: el formulario del panel escribe `null` en
        // los tipos sin tope (lib/planes/formulario.ts), y anunciar «0 de
        // Gyrotonic» sería peor que no decir nada.
        limitePorTipo: Object.fromEntries(
          Object.entries(p.limitePorTipo ?? {})
            .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0),
        ),
        // Solo en suscripciones: en un bono el ciclo lo marcan las sesiones y
        // su caducidad, y un «/mes» ahí sería sencillamente falso.
        periodicidadMeses: familia === 'suscripcion' ? (p.periodicidadMeses ?? 1) : null,
        tiposClaseIds: p.tiposClaseIds ?? [],
        // Un plan no tiene foto: lo que se vende es lo que incluye, no una imagen.
        imagenUrl: null,
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
      limitePorTipo: {},
      periodicidadMeses: null,
      // Un servicio de cita no pasa por `plan_tipos_clase`: no está acotado a
      // tipos de clase porque no se reserva contra el horario.
      tiposClaseIds: [],
      imagenUrl: null,
    }));

  // Productos FÍSICOS. Vienen ya filtrados de servidor (activos y de categoría
  // PRODUCTO); aquí solo se descarta lo que no tiene precio válido, igual que
  // en las otras familias.
  //
  // ⚠️ Estos NO se compran por la app: se compran EN EL ESTUDIO. Por eso no
  // llevan nada que sugiera un checkout —ni sesiones, ni validez, ni límites—
  // y por eso van los últimos: lo que hace crecer a un estudio es que la
  // clienta reserve, no que compre una botella.
  const deProductos: ProductoTienda[] = (productos ?? [])
    .filter((p) => precioValido(p.precio))
    .map((p) => ({
      id: p.id, familia: 'producto' as const,
      nombre: p.nombre,
      descripcion: p.descripcion ?? null,
      precio: p.precio as number,
      sesiones: null,
      validezDias: null,
      duracionMin: null,
      limiteSemanal: null,
      limitePorTipo: {},
      periodicidadMeses: null,
      tiposClaseIds: [],
      imagenUrl: p.imagenUrl ?? null,
    }));

  const orden: Record<FamiliaProducto, number> = { suscripcion: 0, bono: 1, suelta: 2, servicio: 3, producto: 4 };
  return [...dePlanes, ...deServicios, ...deProductos].sort(
    (a, b) => orden[a.familia] - orden[b.familia] || a.precio - b.precio,
  );
}

/** Títulos de sección, en el mismo orden que `catalogoTienda`. */
export const TITULO_FAMILIA: Record<FamiliaProducto, string> = {
  suscripcion: 'Suscripciones',
  bono: 'Bonos y paquetes',
  suelta: 'Clases sueltas',
  servicio: 'Sesiones y privadas',
  producto: 'En el estudio',
};

/**
 * El aviso de la sección de productos, que NO es un detalle de copy.
 *
 * Estos artículos no tienen checkout y no lo van a tener con este diseño: no
 * hay nada detrás que aparte la unidad ni que sepa que hay que entregarla en
 * mano. Cobrar sin eso es justo el patrón que este repo lleva meses quitando.
 *
 * Va VISIBLE en la sección y no en un pie: tiene que leerse antes de que a
 * nadie le apetezca buscar el botón de pagar.
 */
export const AVISO_PRODUCTOS = 'Se compran en el estudio: te los damos en recepción. No hacemos envíos.';

/**
 * Lo que incluye el producto, en una línea.
 *
 * Se construye solo con datos ciertos: si un bono no declara caducidad no se
 * escribe «sin caducidad» —puede que el estudio la aplique por otra vía— sino
 * que simplemente no se menciona.
 *
 * La caducidad ya NO va aquí (P09): «caduca a los 150 días» obligaba a contar
 * días con el calendario en la mano. Va en su propia línea, con la fecha de
 * verdad: `vigenciaDeCompra`.
 */
export function resumenProducto(
  p: ProductoTienda,
  // Opcional: sin los nombres de los tipos de clase no se puede explicar un
  // tope por actividad, y una restricción que no sabemos nombrar no se escribe
  // — mismo criterio que `coberturaDeTipos`.
  nombresTipo?: ReadonlyMap<string, string>,
): string {
  const partes: string[] = [];
  if (p.familia === 'suscripcion') {
    const periodo = nombrePeriodo({ periodicidadMeses: p.periodicidadMeses });
    partes.push(p.sesiones === null ? 'Clases ilimitadas' : `${p.sesiones} clases al ${periodo}`);
  }
  else if (p.sesiones !== null) partes.push(`${p.sesiones} ${p.sesiones === 1 ? 'clase' : 'clases'}`);
  if (p.duracionMin) partes.push(`${p.duracionMin} min`);
  if (p.limiteSemanal) partes.push(`máx. ${p.limiteSemanal}/semana`);
  const topes = topesPorActividad(p, nombresTipo);
  if (topes) partes.push(topes);
  return partes.join(' · ');
}

// ── La tarjeta de la tienda (P09): que se lea sin hacer cuentas ─────────────
//
// Cada línea sale de un dato que ya existe y del MISMO cálculo que hace el
// servidor al cobrar. Ninguna se rellena cuando no se sabe: una línea que falta
// es mejor que una que promete algo que luego no pasa.

/** El precio tal como se lee: «136 €», «13,60 €», «69 €/mes», «180 €/trimestre». */
export function precioDeTienda(p: ProductoTienda): string {
  const base = precioEnEuros(p.precio);
  return p.familia === 'suscripcion' ? `${base}/${nombrePeriodo({ periodicidadMeses: p.periodicidadMeses })}` : base;
}

/**
 * Lo que dice el botón, con el importe dentro: «Comprar · 136 €», «Contratar ·
 * 69 €/mes». `null` en lo que se compra en el estudio, que no tiene botón.
 *
 * Es el precio del producto, el mismo que cobra el checkout. Si el estudio
 * cobra matrícula o hay un código de descuento, el total lo desglosa la hoja de
 * compra ANTES de pagar: el botón no se lo inventa.
 */
export function textoBotonCompra(p: ProductoTienda): string | null {
  if (p.familia === 'producto') return null;
  return `${p.familia === 'suscripcion' ? 'Contratar' : 'Comprar'} · ${precioDeTienda(p)}`;
}

/**
 * «ahorras un 32 %» frente a pagar esas clases sueltas, o `null`.
 *
 * Solo en bonos y solo si es verdad: `ahorroPorcentaje` ya devuelve `null` sin
 * clase suelta con la que comparar, sin ahorro, o si sale más caro, y redondea
 * hacia abajo. Una cuota no se compara: no tiene precio por clase.
 */
export function ahorroFrenteASuelta(p: ProductoTienda, precioSuelta: number | null | undefined): number | null {
  if (p.familia !== 'bono') return null;
  return ahorroPorcentaje({ precio: p.precio, sesiones: p.sesiones }, precioSuelta);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * «Vale 150 días: si lo compras hoy, hasta el 4 de marzo», o `null`.
 *
 * ⚠️ La fecha sale de `cicloInicialDe`, la MISMA función con la que
 * `entregarPlanComprado` escribe `fecha_fin` al cobrar (día del estudio, no de
 * UTC). Calcularla aquí por otro camino es la forma de prometer un día y
 * entregar otro. Y la fecha es el último día que vale: el bono sirve mientras
 * `fecha_fin >= hoy` (`tieneEntitlementActivo`).
 *
 * El año solo se escribe cuando hace falta: una fecha sin año se lee como la
 * próxima vez que llega, y eso solo confunde cuando está a casi un año o más
 * (un bono de 365 días comprado el 5 de octubre «vale hasta el 5 de octubre»).
 *
 * `null` en las cuotas (se renuevan, no caducan: ver `renovacionDeCuota`) y en
 * lo que no declara caducidad, que no se rellena con un «no caduca».
 */
export function vigenciaDeCompra(p: ProductoTienda, ahora: Date): string | null {
  if (p.familia !== 'bono' && p.familia !== 'suelta') return null;
  const dias = p.validezDias;
  if (!dias || dias <= 0) return null;
  const { fechaFin } = cicloInicialDe(
    { tipo: p.familia === 'bono' ? 'BONO' : 'PUNTUAL', sesiones: p.sesiones, validezDias: dias },
    ahora.toISOString(),
  );
  if (!fechaFin) return null;
  const [anio, mes, dia] = fechaFin.split('-').map(Number);
  const fecha = `${dia} de ${MESES[mes - 1]}${dias > 300 ? ` de ${anio}` : ''}`;
  return `Vale ${dias} ${dias === 1 ? 'día' : 'días'}: si lo compras hoy, hasta el ${fecha}`;
}

/**
 * La frase de renovación de una cuota, sacada de SU plan: «Se renueva sola cada
 * mes hasta que te des de baja», o «cada trimestre» si se cobra por trimestres.
 *
 * Es lo que le pasa de verdad: el cobro de la cuota guarda la tarjeta para las
 * renovaciones (`setup_future_usage`, solo en cuotas) y el cron la renueva cada
 * periodo; el panel le explica lo mismo a la propietaria al crearla. No dice
 * «la cancelas cuando quieras» porque la baja no está en la app: la da el
 * estudio.
 */
export function renovacionDeCuota(p: ProductoTienda): string | null {
  if (p.familia !== 'suscripcion') return null;
  return `Se renueva sola cada ${nombrePeriodo({ periodicidadMeses: p.periodicidadMeses })} hasta que te des de baja.`;
}

/** «A», «A y B», «A, B y C». */
function enLista(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Los nombres legibles de unos tipos de clase, sin repetir y sin inventar los que no se conocen. */
function nombresDeTipos(ids: readonly string[], nombres: ReadonlyMap<string, string>): string[] {
  const vistos = new Set<string>();
  const legibles: string[] = [];
  for (const id of ids) {
    const n = nombres.get(id)?.trim();
    if (!n || vistos.has(n)) continue;
    vistos.add(n);
    legibles.push(n);
  }
  return legibles;
}

/**
 * Para qué clases sirve: «Para todas las clases» o «Para Reformer, Mat y Barre».
 *
 * La misma regla que el servidor (`cubreTipo`): sin tipos asignados sirve para
 * todas. Solo en lo que se usa para reservar clases (cuotas, bonos, sueltas):
 * una privada o una botella no se reservan contra el horario.
 *
 * `null` si está acotado a tipos que no se pueden nombrar (archivados o que el
 * estudio no publica): decir «para todas» sería mentir, y decir «para» y nada,
 * no decir nada.
 */
export function paraQueClases(p: ProductoTienda, nombres: ReadonlyMap<string, string>): string | null {
  if (p.familia !== 'suscripcion' && p.familia !== 'bono' && p.familia !== 'suelta') return null;
  if (p.tiposClaseIds.length === 0) return 'Para todas las clases';
  const legibles = nombresDeTipos(p.tiposClaseIds, nombres);
  return legibles.length ? `Para ${enLista(legibles)}` : null;
}


/**
 * A qué tipos de clase está ACOTADO el producto, en una línea, o `null` si
 * sirve para todas.
 *
 * ⚠️ Esto lo decidía el servidor y la tienda no lo contaba. Un bono acotado a
 * Mat se vendía como «Bono 8 clases · caduca a los 60 días», sin una palabra
 * sobre que en un Reformer no vale: la alumna lo compraba, iba a reservar y el
 * servidor rechazaba la reserva (`planCubreTipoClase`, lib/bono-logic.ts). Lo
 * que hace falta saber ANTES de pagar se dice antes de pagar.
 *
 * `nombres` traduce id → nombre con los tipos que YA viajan en el payload
 * público. Un id que no esté ahí (tipo archivado, o que el estudio no publica)
 * se OMITE en vez de inventarle un nombre; y si no queda ninguno reconocible
 * no se escribe nada, porque una restricción que no sabemos nombrar no se
 * puede explicar.
 */
export function coberturaProducto(
  p: ProductoTienda,
  nombres: ReadonlyMap<string, string>,
): string | null {
  return coberturaDeTipos(p.tiposClaseIds, nombres);
}

/**
 * Igual, pero desde los ids sueltos — para quien tiene el plan y no su
 * proyección de tienda (la hoja de compra recibe el `PlanTarifa` entero).
 */
export function coberturaDeTipos(
  tiposClaseIds: readonly string[] | null | undefined,
  nombres: ReadonlyMap<string, string>,
): string | null {
  if (!tiposClaseIds || tiposClaseIds.length === 0) return null;
  const legibles = nombresDeTipos(tiposClaseIds, nombres);
  // «A, B y C» — la conjunción en español, no una lista con comas sueltas.
  return legibles.length ? `Solo para ${enLista(legibles)}` : null;
}


/**
 * Los topes semanales POR ACTIVIDAD en una frase, o `null` si no hay ninguno
 * que se pueda nombrar.
 *
 * Convive con `limiteSemanal` y no lo sustituye: son cosas distintas (el techo
 * TOTAL de la cuota y el techo de cada actividad), y una cuota combinada puede
 * tener los dos. Por eso el resumen los enseña seguidos.
 */
export function topesPorActividad(
  p: ProductoTienda,
  nombres?: ReadonlyMap<string, string>,
): string | null {
  if (!nombres) return null;
  const partes: string[] = [];
  for (const [id, n] of Object.entries(p.limitePorTipo)) {
    const nombre = nombres.get(id)?.trim();
    // Un tipo archivado o que el estudio no publica se OMITE en vez de
    // inventarle un nombre, igual que en `coberturaDeTipos`.
    if (!nombre) continue;
    partes.push(`${n} de ${nombre}`);
  }
  if (partes.length === 0) return null;
  const cuerpo = partes.length === 1
    ? partes[0]
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  return `${cuerpo} por semana`;
}
