// ⚠️ Import RELATIVO, no `@/`: `node --test --experimental-strip-types` no
// resuelve ese alias, y ponerlo aquí tumbó `datos-mapeo.test.ts` y
// `proyeccion-payload.test.ts` — que importan este módulo por ruta relativa.
// `hoyEnEstudio` vive en lib/utils.ts y la comparte con `bono-logic.ts`, que
// es quien fija la regla de vigencia en servidor. Import relativo por el
// mismo motivo que el resto del fichero.
import { hoyEnEstudio } from '../utils.ts';
import { imagenDeClase } from '../imagenes-por-defecto.ts';
import { precioDeSesion } from './precio-suelta.ts';
import { proyectarPlazaFija as plazaFijaDe, proyectarRecuperaciones as recuperacionesDe, type PlazaFijaMin, type RecuperacionMin } from './plaza-fija.ts';
// `nivelDe` con alias: en este fichero ya hay una `nivelDe` local, la que
// traduce el nivel de una CLASE (PRINCIPIANTE → Iniciación). Nada que ver.
import { hayGamificacion, logrosDe, nivelDe as nivelDeCreditos, recompensasDe, retosDe, type LogroDef, type NivelDef, type ProgresoMin, type RecompensaDef, type RetoDef } from './gamificacion.ts';
import type { Alumna, Bono, Clase, EstadoBono, EstadoPago, EstadoReserva, GamificacionVista, Instructora, NivelClase, Pago, PlazaFijaVista, RecuperacionesVista, Reserva } from './tipos.ts';

// Traducción PURA entre el vocabulario del backend y el del paquete de diseño.
//
// Aparte de `datos.ts` a propósito: aquel es `'use client'` y hace fetch, así
// que no se puede probar con el runner de Node. Esto son funciones sin
// dependencias, y son justo las que más falta hace probar — cuando un enum no
// casa, la traducción cae al valor por defecto y la pantalla enseña algo
// plausible pero falso, sin que salte ninguna excepción.
//
// Ver `datos-mapeo.test.ts`.

/**
 * Estados que OCUPAN plaza.
 *
 * ⚠️ Decisión arbitrada, no copiada. En el repo conviven dos criterios: la
 * proyección del widget (`lib/reservar/construir-slots.ts:83`) cuenta «toda
 * reserva que no sea CANCELADA», y /reservar cuenta solo CONFIRMADA/ASISTIDA.
 * Con lista de espera los dos dan aforos DISTINTOS para la misma clase.
 *
 * Manda el servidor: la RPC `reservar_plaza` cuenta
 * `estado in ('CONFIRMADA','ASISTIDA')` antes de decidir. Cualquier otro
 * criterio en el cliente enseña plazas que el servidor va a rechazar.
 */
export const OCUPA_PLAZA: ReadonlySet<string> = new Set(['CONFIRMADA', 'ASISTIDA']);

/**
 * Nivel de clase: los dos vocabularios NO coinciden.
 *
 * ⚠️ El backend usa un enum en mayúsculas (`lib/types.ts`:
 * `'TODOS' | 'PRINCIPIANTE' | 'MEDIO' | 'AVANZADO'`) y el diseño rótulos en
 * caja mixta. Comprobado contra la base de datos: los cuatro están en uso.
 *
 * Sin este mapa, una comparación directa fallaría SIEMPRE y las cuatro clases
 * se pintarían como «Todos» sin que nada avisara.
 */
const NIVEL: Record<string, NivelClase> = {
  TODOS: 'Todos',
  PRINCIPIANTE: 'Iniciación',
  MEDIO: 'Medio',
  AVANZADO: 'Avanzado',
};

export function nivelDe(v: string | null | undefined): NivelClase {
  return NIVEL[(v ?? '').toUpperCase()] ?? 'Todos';
}

/** Los seis estados de `reservas` → los cinco del diseño. */
const ESTADO_RESERVA: Record<string, EstadoReserva> = {
  CONFIRMADA: 'confirmada',
  CANCELADA: 'cancelada',
  ASISTIDA: 'asistida',
  NO_ASISTIO: 'no-asistida',
  LISTA_ESPERA: 'en-espera',
  // El backend tiene un sexto estado que el diseño no contempla. Se enseña como
  // «en-espera» porque es lo que la alumna ve: todavía no tiene plaza.
  PENDIENTE_APROBACION: 'en-espera',
};

export function estadoReservaDe(v: string | null | undefined): EstadoReserva {
  return ESTADO_RESERVA[v ?? ''] ?? 'confirmada';
}

/**
 * `EstadoRecibo` del backend → lo que ve la alumna.
 *
 * ⚠️ `PENDIENTE` y `EN_CURSO` caían los dos en `processing`, y son cosas
 * distintas. `EN_CURSO` es un adeudo SEPA en vuelo: el cobro está saliendo y el
 * banco todavía puede devolverlo. `PENDIENTE` es un recibo EMITIDO Y SIN
 * COBRAR —lo que el panel llama «pendientes» y lo que el dunning reintenta
 * (índice `idx_recibos_dunning`)—: ahí no hay ningún cobro en marcha.
 *
 * Leerlos igual le decía a una alumna con un recibo impagado «el banco todavía
 * no ha confirmado el cobro, te avisaremos»: se queda esperando un aviso que no
 * va a llegar, mientras lo que hay es una deuda que alguien tiene que cobrar.
 * Es el mismo error que ya se evitó con `EN_CURSO` ≠ `COBRADO`, una casilla más
 * abajo.
 */
const ESTADO_PAGO: Record<string, EstadoPago> = {
  COBRADO: 'success',
  EN_CURSO: 'processing',
  PENDIENTE: 'pending',
  FALLIDO: 'failed',
  DEVUELTO: 'refunded',
};

export function estadoPagoDe(v: string | null | undefined): EstadoPago {
  // Por defecto `pending`, no `processing`: ante un estado que no conocemos,
  // «todavía sin cobrar» es lo que menos promete.
  return ESTADO_PAGO[v ?? ''] ?? 'pending';
}

// ── Bonos ───────────────────────────────────────────────────────────────────

/** Lo mínimo de una fila de `suscripciones` para proyectar un bono. */
export interface SuscripcionMin {
  id: string;
  planId: string;
  estado: string;
  fechaInicio: string;
  fechaFin: string | null;
  sesionesRestantes: number | null;
}

/** Lo mínimo de una fila de `planes_tarifa`. */
export interface PlanMin {
  id: string;
  nombre: string;
  sesiones: number | null;
  precio: number;
  /** `PUNTUAL` es el plan de clase suelta — el que fija su precio. */
  tipo?: string | null;
  /** El checkout exige `activo`; enseñar el precio de un plan apagado
      llevaría a un cobro que la ruta rechaza. */
  activo?: boolean | null;
  /** Tipos de clase a los que está acotado. Vacío = todos. Lo cuelga
      `hidratarTiposDePlanes` en el payload público. */
  tiposClaseIds?: string[];
}

/**
 * Una suscripción → el `Bono` del diseño.
 *
 * ⚠️ `sesionesRestantes === null` significa ILIMITADO, no cero. Es el error más
 * caro posible de esta traducción: enseñaría «0 sesiones» a quien tiene un
 * mensual ilimitado. El diseño no tiene ese concepto —`creditosTotales` es un
 * número—, así que se representa con `Infinity` y las pantallas comprueban
 * `Number.isFinite()` antes de pintar un contador.
 *
 * `ahora` se pasa por parámetro y no se lee de `Date.now()` dentro: así el
 * caso «caducado» es comprobable sin viajar en el tiempo.
 */
export function bonoDeSuscripcion(s: SuscripcionMin, plan: PlanMin | undefined, ahora: number): Bono {
  const ilimitado = s.sesionesRestantes === null;
  const totales = plan?.sesiones ?? 0;
  const restantes = s.sesionesRestantes ?? 0;
  // ⚠️ Se compara DÍA con DÍA, no un día contra un instante.
  //
  // Esto era `new Date(s.fechaFin).getTime() < ahora`, y `s.fechaFin` es
  // 'YYYY-MM-DD': `new Date()` lo lee como MEDIANOCHE UTC, así que a cualquier
  // hora de su último día válido el bono ya salía caducado. La alumna veía la
  // tarjeta atenuada, la etiqueta «Expirado» y un «caducó hoy», y al abrir una
  // clase se le pedía pagar — mientras el servidor seguía aceptando ese bono
  // tan campante (`!s.fechaFin || s.fechaFin >= hoyISO`, lib/bono-logic.ts, y
  // `fecha_fin >= current_date` en SQL). Perdía el último día de su bono y lo
  // más probable es que volviera a comprar.
  //
  // Ahora usa la MISMA regla que el servidor, y en el día del ESTUDIO: un bono
  // vale hasta el final de su fecha de fin.
  const caducado = !!s.fechaFin && s.fechaFin < hoyEnEstudio(new Date(ahora));

  let estado: EstadoBono = 'activo';
  // El orden importa: la FECHA manda sobre el saldo. Un bono con sesiones de
  // sobra pero fuera de plazo está expirado, que es lo que dirá el servidor al
  // intentar usarlo.
  if (caducado) estado = 'expirado';
  else if (s.estado !== 'ACTIVA') estado = 'expirado';
  else if (!ilimitado && restantes <= 0) estado = 'agotado';

  return {
    // A qué tipos de clase está acotado: lo necesita la hoja de clase para no
    // prometer «no pagas nada hoy» con un bono que no cubre esa clase.
    tiposClaseIds: plan?.tiposClaseIds,
    id: s.id,
    nombre: plan?.nombre ?? 'Bono',
    creditosTotales: ilimitado ? Infinity : totales,
    creditosUsados: ilimitado ? 0 : Math.max(0, totales - restantes),
    compradoEn: s.fechaInicio,
    expiraEn: s.fechaFin,
    estado,
    precio: plan?.precio ?? 0,
  };
}

// ── Proyecciones ────────────────────────────────────────────────────────────
//
// Puras: reciben el payload y devuelven el modelo del diseño. Aparte de
// `datos.ts` para que se puedan probar contra un payload REAL sin navegador —
// que es lo único que demuestra que los nombres de campo son los de verdad.

/** Fecha ISO local (YYYY-MM-DD) del instante dado, en la zona del estudio. */
export function fechaLocal(iso: string): string {
  // `sv-SE` da exactamente `YYYY-MM-DD`, que es el formato del diseño.
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
}

/** Hora local HH:mm. */
export function horaLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/**
 * Forma MÍNIMA del payload que las proyecciones necesitan.
 *
 * Estructural a propósito, y no un import de `catalogo.ts`: ese módulo es
 * `'use client'` y arrastra `api-client`, así que importarlo aquí volvería a
 * hacer imposible probar esto con el runner de Node.
 */
export interface PayloadMin {
  studio?: { fotoUrl?: string | null } | null;
  sesiones?: {
    id: string; inicio: string; fin: string; aforoMaximo: number;
    tipoClaseId: string; salaId: string; instructorId: string;
    cancelada: boolean; precioPuntual: number | null;
  }[];
  tiposClase?: { id: string; nombre: string; nivel?: string | null; fotoUrl?: string | null; logoUrl?: string | null; descripcion?: string | null; ventanaCancelacionHoras?: number | null }[];
  levelDefinitions?: NivelDef[];
  achievementDefinitions?: LogroDef[];
  challengeDefinitions?: RetoDef[];
  rewardCatalog?: RecompensaDef[];
  salas?: { id: string; nombre: string; fotoUrl?: string | null }[];
  instructores?: {
    id: string; nombre: string; activo?: boolean; fotoUrl?: string | null;
    bio?: string | null; valoracion?: { media: number; total: number };
  }[];
  planesTarifa?: PlanMin[];
  aforoReservas?: { sesion_id: string; estado: string }[];
  socia?: {
    // La ficha entera de `socios` (lib/db/supabase-data-admin.ts:768 hace
    // `select('*')`). `SociaSesion` solo trae socioId/nombre/email, que no
    // basta para la pantalla de datos personales.
    socio?: {
      id?: string; nombre?: string | null; apellidos?: string | null;
      email?: string | null; telefono?: string | null; direccion?: string | null;
      fotoUrl?: string | null;
    } | null;
    suscripciones?: SuscripcionMin[];
    reservas?: { id: string; sesionId: string; socioId: string; estado: string; creadoEn: string; posicionEspera: number | null; ofertaExpiraEn?: string | null }[];
    recibos?: { id: string; concepto?: string | null; importe?: number | null; estado: string; fechaCobro?: string | null; fechaVencimiento?: string | null; metodoCobro?: string | null; suscripcionId?: string | null }[];
    /** Tipos de clase marcados como favoritos (`favoritos_clase`). */
    favoritos?: { tipoClaseId: string }[];
    plazasFijas?: PlazaFijaMin[];
    recuperaciones?: RecuperacionMin[];
    memberCredits?: { saldo: number; totalGanado: number; totalCanjeado: number }[];
    achievementProgress?: ProgresoMin[];
    challengeProgress?: ProgresoMin[];
    retosApuntados?: string[];
  } | null;
}

/**
 * El horario.
 *
 * ⚠️ `plazasLibres` es ORIENTATIVO y el diseño ya lo asume (handoff §G: nunca
 * se anuncia éxito sin respuesta del servidor). El aforo REAL es
 * `aforo_efectivo(sesion_id)`, que resta las máquinas averiadas
 * (`bloqueos_maquina`), y ese dato NO viaja en ningún payload público. Con un
 * reformer averiado este número es optimista y el servidor devolverá `full`.
 * Es el comportamiento correcto, no un fallo a tapar en el cliente.
 */
export function proyectarClases(d: PayloadMin, fecha?: string): Clase[] {
  const tipos = new Map((d.tiposClase ?? []).map((t) => [t.id, t]));
  const salas = new Map((d.salas ?? []).map((s) => [s.id, s]));

  // Ocupadas por sesión, con el MISMO criterio que la RPC.
  const ocupadas = new Map<string, number>();
  for (const r of d.aforoReservas ?? []) {
    if (!OCUPA_PLAZA.has(r.estado)) continue;
    ocupadas.set(r.sesion_id, (ocupadas.get(r.sesion_id) ?? 0) + 1);
  }

  const salida: Clase[] = [];
  for (const s of d.sesiones ?? []) {
    if (s.cancelada) continue;
    const f = fechaLocal(s.inicio);
    if (fecha && f !== fecha) continue;

    const tipo = tipos.get(s.tipoClaseId);
    const sala = salas.get(s.salaId);

    salida.push({
      id: s.id,
      tipoClaseId: s.tipoClaseId,
      ventanaCancelacionHoras: tipo?.ventanaCancelacionHoras ?? null,
      fecha: f,
      hora: horaLocal(s.inicio),
      duracionMin: Math.max(1, Math.round((new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 60000)),
      nombre: tipo?.nombre ?? 'Clase',
      tipo: tipo?.nombre ?? 'Clase',
      // El backend no clasifica por disciplina; el diseño solo la usa como
      // etiqueta. Se deja en Pilates en vez de inventar una taxonomía.
      disciplina: 'Pilates',
      nivel: nivelDe(tipo?.nivel),
      instructoraId: s.instructorId,
      sala: sala?.nombre ?? '',
      salaId: s.salaId ?? '',
      capacidad: s.aforoMaximo,
      plazasLibres: Math.max(0, s.aforoMaximo - (ocupadas.get(s.id) ?? 0)),
      // ⚠️ Antes: `s.precioPuntual ?? 0`. `sesiones.precio_puntual` es un
      // OVERRIDE por sesión y está a NULL en la inmensa mayoría, así que la
      // app enseñaba «0 €» a quien no tiene bono. La clase no es gratis: el
      // precio vive en el plan `PUNTUAL` del estudio, que es EXACTAMENTE de
      // donde `checkout-embebido` saca el importe que cobra.
      // `null` (el estudio no vende sueltas) se pinta como 0 aquí solo
      // porque `Clase.precioSuelto` es `number`; quien decide qué enseñar es
      // `etiquetaPrecio()`, que distingue los dos casos.
      precioSuelto: precioDeSesion(s.precioPuntual, d.planesTarifa) ?? 0,
      /** `true` si el estudio NO vende clases sueltas: no es «gratis». */
      sinPrecioSuelto: precioDeSesion(s.precioPuntual, d.planesTarifa) === null,
      // ⚠️ Herencia del BANNER, y el orden importa.
      //
      // Era `sala ?? tipo ?? studio` por un motivo que sigue siendo válido:
      // como casi ningún tipo de clase tenía foto, TODAS las clases enseñaban
      // la misma imagen del estudio —que a menudo es la foto de la
      // propietaria—, y la sala al menos tiene un aspecto reconocible.
      //
      // Lo que cambia es solo el primer escalón: si la propietaria ha subido
      // un banner A ESTA CLASE, manda el suyo. Es una elección explícita sobre
      // esta clase concreta, y dejar que la foto genérica de la sala la tapara
      // convertía el banner por clase en una función que no se ve nunca. Sin
      // banner propio, todo sigue exactamente igual que antes.
      //
      // ⚠️ Y si NINGUNO de los tres tiene foto, la por defecto de su familia
      // de disciplina. Sin esto la cadena acababa en `''`, y una cadena vacía
      // no es «sin foto»: es un `<img src="">` y una cabecera de 290 px de
      // negro liso en el detalle de la clase — el hueco roto que el diseño
      // prohíbe expresamente.
      //
      // No es una decisión nueva: `lib/imagenes-por-defecto.ts` ya la dejó
      // escrita al listar dónde SÍ va foto por defecto —«la foto de clase se
      // pinta grande (detalle, sesión guiada) y ahí sí lleva default»— y dejó
      // el ayudante hecho y probado. La app de la alumna nunca lo llamó. Los
      // dos únicos sitios que leen esto son renders grandes, así que no entra
      // en el caso excluido (las miniaturas de los listados, donde la misma
      // foto ocho veces se lee como un error).
      fotoUrl: imagenDeClase({ fotoUrl: tipo?.fotoUrl ?? sala?.fotoUrl ?? d.studio?.fotoUrl, nombre: tipo?.nombre }),
      // El logo NO hereda: ver el comentario en `Clase.logoUrl`.
      logoUrl: tipo?.logoUrl ?? undefined,
      descripcion: tipo?.descripcion ?? undefined,
    });
  }

  // Cronológico: el diseño pinta el horario en orden y no reordena.
  return salida.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

export function proyectarInstructoras(d: PayloadMin): Instructora[] {
  return (d.instructores ?? [])
    .filter((i) => i.activo !== false)
    .map((i) => ({
      id: i.id,
      nombre: i.nombre,
      iniciales: (i.nombre ?? '?').trim().slice(0, 2).toUpperCase(),
      fotoUrl: i.fotoUrl ?? null,
      // `Instructor` no tiene especialidades en este backend: lo más parecido
      // es `especialidadNetwork`, que es de TipoClase y de otro producto.
      especialidades: [],
      // ⚠️ La nota solo se enseña con AL MENOS 5 valoraciones. `valoracion`
      // trae media Y total precisamente por esto: con dos votos, un «5,0» dice
      // que es perfecta cuando lo que pasa es que la han puntuado dos veces.
      rating: i.valoracion && i.valoracion.total >= 5 ? i.valoracion.media : undefined,
      valoraciones: i.valoracion && i.valoracion.total >= 5 ? i.valoracion.total : undefined,
      bio: i.bio ?? undefined,
    }));
}

/**
 * Todo lo que la alumna ve de gamificación, ya ordenado. El progreso y el saldo
 * vienen calculados del servidor; aquí solo se presenta.
 */
export function proyectarGamificacion(d: PayloadMin, hoyISO: string): GamificacionVista {
  const c = d.socia?.memberCredits?.[0];
  const saldo = c?.saldo ?? 0;
  const totalGanado = c?.totalGanado ?? 0;
  const niveles = d.levelDefinitions ?? [];
  const logros = logrosDe(d.achievementDefinitions ?? [], d.socia?.achievementProgress ?? []);
  const retos = retosDe(d.challengeDefinitions ?? [], d.socia?.challengeProgress ?? [], d.socia?.retosApuntados ?? [], hoyISO);
  const recompensas = recompensasDe(d.rewardCatalog ?? [], saldo);
  return {
    hay: hayGamificacion({ niveles, logros: d.achievementDefinitions ?? [], retos: d.challengeDefinitions ?? [], recompensas: d.rewardCatalog ?? [] }),
    saldo, totalGanado, totalCanjeado: c?.totalCanjeado ?? 0,
    nivel: nivelDeCreditos(totalGanado, niveles),
    logros, retos, recompensas,
  };
}

/** La plaza fija vigente, con nombres de sala y tipo. `null` sin plaza (o sin sesión). */
export function proyectarPlazaFija(d: PayloadMin, hoyISO: string, horaAhora = '00:00'): PlazaFijaVista | null {
  const p = plazaFijaDe(d.socia?.plazasFijas ?? [], hoyISO, horaAhora);
  if (!p) return null;
  const sala = (d.salas ?? []).find((s) => s.id === p.salaId)?.nombre ?? 'Sala';
  const tipo = p.tipoClaseId ? ((d.tiposClase ?? []).find((t) => t.id === p.tipoClaseId)?.nombre ?? null) : null;
  return { diaSemana: p.diaSemana, hora: p.hora, sala, tipo, estado: p.estado, proximaFecha: p.proximaFecha, vigenciaHasta: p.vigenciaHasta };
}

/** Recuperaciones que aún puede usar. */
export function proyectarRecuperaciones(d: PayloadMin, hoyISO: string): RecuperacionesVista {
  return recuperacionesDe(d.socia?.recuperaciones ?? [], hoyISO);
}

/** Tipos de clase favoritos de la socia. Vacío sin sesión. */
export function proyectarFavoritos(d: PayloadMin): Set<string> {
  return new Set((d.socia?.favoritos ?? []).map((f) => f.tipoClaseId));
}

export function proyectarReservas(d: PayloadMin): Reserva[] {
  const socia = d.socia;
  if (!socia) return [];

  return (socia.reservas ?? []).map((r) => ({
    id: r.id,
    claseId: r.sesionId,
    alumnaId: r.socioId,
    estado: estadoReservaDe(r.estado),
    creadaEn: r.creadoEn,
    // NO hay `pagadaCon`: `reservas` no guarda con qué se pagó (el consumo de
    // bono es un paso aparte, `consumir_sesion_bono`, y no deja columna). Lo
    // que había era una suposición —«¿tiene bono activo HOY?»— que etiquetaba
    // como pagadas con bono reservas de hace meses. Lo único cierto sobre el
    // dinero es el recibo (`Pago`), y se enseña en Pagos.
    posicionEspera: r.posicionEspera ?? undefined,
    ofertaExpiraEn: r.ofertaExpiraEn ?? undefined,
  }));
}

export function proyectarBonos(d: PayloadMin, ahora: number): Bono[] {
  const socia = d.socia;
  if (!socia) return [];
  const planes = new Map((d.planesTarifa ?? []).map((p) => [p.id, p]));
  return (socia.suscripciones ?? []).map((s) => bonoDeSuscripcion(s, planes.get(s.planId), ahora));
}

/**
 * El historial de pagos.
 *
 * ⚠️ En el backend esto son TRES tablas: `recibos` (el cobro), `facturas` (el
 * documento fiscal sellado con Veri*Factu) y `devoluciones`. El diseño tiene un
 * solo tipo `Pago`. Se proyectan los RECIBOS, que es lo que la alumna entiende
 * por «un pago»; la factura es un documento aparte, con su número y su sellado.
 */
export function proyectarPagos(d: PayloadMin): Pago[] {
  const socia = d.socia;
  if (!socia) return [];

  return (socia.recibos ?? [])
    .map((r) => ({
      id: r.id,
      concepto: r.concepto ?? 'Pago',
      importe: r.importe ?? 0,
      // `fechaCobro` cuando ya se cobró; si no, la de vencimiento, que es la
      // que la alumna ve como «fecha del recibo». `Recibo` no tiene creadoEn.
      fecha: r.fechaCobro ?? r.fechaVencimiento ?? '',
      estado: estadoPagoDe(r.estado),
      metodo: r.metodoCobro ?? '',
      bonoId: r.suscripcionId ?? undefined,
    }))
    // Más reciente primero: es como los lee cualquiera.
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * La ficha de la alumna, para la pantalla de datos personales.
 *
 * ⚠️ NO sale de `SociaSesion` (el hook de sesión), que solo lleva socioId,
 * nombre y email — con eso, «Datos personales» habría salido con apellidos,
 * teléfono y dirección en blanco y los habría GUARDADO vacíos al primer envío.
 */
export function proyectarAlumna(d: PayloadMin): Alumna | null {
  const s = d.socia?.socio;
  if (!s?.id) return null;
  return {
    id: s.id,
    nombre: s.nombre ?? '',
    apellidos: s.apellidos ?? '',
    email: s.email ?? '',
    telefono: s.telefono ?? undefined,
    fotoUrl: s.fotoUrl ?? null,
  };
}
