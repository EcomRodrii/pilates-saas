import type { Alumna, Bono, Clase, EstadoBono, EstadoPago, EstadoReserva, Instructora, NivelClase, Pago, Reserva } from './tipos.ts';

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

/** `EstadoRecibo` del backend → los cinco del diseño. */
const ESTADO_PAGO: Record<string, EstadoPago> = {
  COBRADO: 'success',
  // `EN_CURSO` es un adeudo SEPA en vuelo. Leerlo como pagado le diría a la
  // alumna que ya está cobrado cuando el banco todavía puede devolverlo.
  EN_CURSO: 'processing',
  PENDIENTE: 'processing',
  FALLIDO: 'failed',
  DEVUELTO: 'refunded',
};

export function estadoPagoDe(v: string | null | undefined): EstadoPago {
  return ESTADO_PAGO[v ?? ''] ?? 'processing';
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
  const caducado = !!s.fechaFin && new Date(s.fechaFin).getTime() < ahora;

  let estado: EstadoBono = 'activo';
  // El orden importa: la FECHA manda sobre el saldo. Un bono con sesiones de
  // sobra pero fuera de plazo está expirado, que es lo que dirá el servidor al
  // intentar usarlo.
  if (caducado) estado = 'expirado';
  else if (s.estado !== 'ACTIVA') estado = 'expirado';
  else if (!ilimitado && restantes <= 0) estado = 'agotado';

  return {
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
  tiposClase?: { id: string; nombre: string; nivel?: string | null; fotoUrl?: string | null; descripcion?: string | null }[];
  salas?: { id: string; nombre: string }[];
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
    reservas?: { id: string; sesionId: string; socioId: string; estado: string; creadoEn: string; posicionEspera: number | null }[];
    recibos?: { id: string; concepto?: string | null; importe?: number | null; estado: string; fechaCobro?: string | null; fechaVencimiento?: string | null; metodoCobro?: string | null; suscripcionId?: string | null }[];
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
      capacidad: s.aforoMaximo,
      plazasLibres: Math.max(0, s.aforoMaximo - (ocupadas.get(s.id) ?? 0)),
      precioSuelto: s.precioPuntual ?? 0,
      fotoUrl: tipo?.fotoUrl ?? d.studio?.fotoUrl ?? '',
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
      bio: i.bio ?? undefined,
    }));
}

export function proyectarReservas(d: PayloadMin): Reserva[] {
  const socia = d.socia;
  if (!socia) return [];
  const tieneBonoActivo = (socia.suscripciones ?? []).some((s) => s.estado === 'ACTIVA');

  return (socia.reservas ?? []).map((r) => ({
    id: r.id,
    claseId: r.sesionId,
    alumnaId: r.socioId,
    estado: estadoReservaDe(r.estado),
    creadaEn: r.creadoEn,
    // El backend no guarda CON QUÉ se pagó una reserva: el consumo de bono es
    // un paso aparte (`consumir_sesion_bono`) y no deja columna en `reservas`.
    // Sirve para el texto de la pantalla, nunca para decidir un cobro.
    pagadaCon: tieneBonoActivo ? 'bono' : 'suelto',
    posicionEspera: r.posicionEspera ?? undefined,
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
