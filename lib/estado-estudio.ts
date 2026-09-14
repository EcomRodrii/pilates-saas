// ─────────────────────────────────────────────────────────────────────────────
// Estado del estudio — la bandeja única de «qué espera tu visto bueno».
//
// El problema que resuelve no es de datos, es de sitio. Lo que una propietaria
// tenía que decidir vivía repartido en diez pantallas sin ningún contador que
// lo juntara: las reservas por aprobar solo en el panel lateral del
// calendario, las sustituciones en /sustituciones, las penalizaciones y las
// devoluciones en tarjetas sueltas de la home, los cobros que el dunning dio
// por perdidos en /cobros, las automatizaciones esperando en /automatizaciones.
// Para saber si tenía algo pendiente había que ir a mirar a los diez sitios.
//
// Tres bandejas, que son las tres cosas que ella necesita saber:
//   · DECIDIR    — no avanza sin ti.
//   · EN MARCHA  — Tentare lo está haciendo; no tienes que tocar nada.
//   · RESUELTO   — Tentare lo ha hecho por ti (hoy / últimas 24 h).
//
// NO es un motor nuevo ni una fuente nueva: son recuentos de los estados que
// ya escriben los flujos existentes. Y NO incluye las recomendaciones del
// Decision OS: esas son sugerencias (el ActionCenter las cuenta aparte, justo
// debajo), no algo que bloquee la operación del día.
//
// ⚠️ Nunca «todo bien» en absoluto. El Centro de Control y la home ya se
// contradijeron una vez a un clic de distancia («Todo bajo control» frente a
// «9 cosas necesitan tu atención», #1401). Esta bandeja solo afirma lo que
// cuenta: que nada espera tu VISTO BUENO. Hay un test que lo fija.
//
// Puro y sin I/O (ver estado-estudio.test.ts). Los recuentos los hace
// app/api/estado-estudio/route.ts, acotados por rol.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recuentos por fuente. `undefined` = este rol no puede verlo (no se enseña ni
 * se cuenta). `null` = la consulta falló: tampoco se enseña — un cero inventado
 * diría «nada pendiente» justo cuando no lo sabemos.
 */
export interface ConteosEstudio {
  // Decidir
  sustitucionesPorDecidir?: number | null;
  /**
   * De esas, las 'agotada' con candidatos de Tentare Network guardados. NO es
   * una línea ni suma al contador: es un sufijo de `sustitucionesPorDecidir`
   * (son las MISMAS clases, contarlas dos veces inflaría el «espera tu visto
   * bueno»). Clases, nunca nombres.
   */
  sustitucionesConNetwork?: number | null;
  reservasPorAprobar?: number | null;
  recibosFallidos?: number | null;
  penalizacionesPorAprobar?: number | null;
  devolucionesPorRevisar?: number | null;
  automatizacionesEsperando?: number | null;
  canjesPorEntregar?: number | null;
  // En marcha
  sustitucionesBuscando?: number | null;
  ofertasListaEspera?: number | null;
  cobrosEnReintento?: number | null;
  // Resuelto
  sustitucionesCubiertas24h?: number | null;
  accionesAutonomasHoy?: number | null;
  mensajesAutomaticosHoy?: number | null;
}

// `sustitucionesConNetwork` no es una línea: solo modifica el texto de otra.
export type ClaveConteo = Exclude<keyof ConteosEstudio, 'sustitucionesConNetwork'>;
export type Bandeja = 'decidir' | 'enMarcha' | 'resuelto';

export interface LineaEstado {
  id: ClaveConteo;
  n: number;
  texto: string;
  /** null = se resuelve en una tarjeta de la propia home, no hay a dónde ir. */
  href: string | null;
}

export interface EstadoEstudio {
  /** false = este rol no ve ninguna fuente (p.ej. INSTRUCTOR): no se pinta nada. */
  aplica: boolean;
  decidir: LineaEstado[];
  enMarcha: LineaEstado[];
  resuelto: LineaEstado[];
  /** Suma de lo que espera decisión: es la cifra del contador del menú. */
  nDecidir: number;
  titulo: string;
}

interface DefLinea {
  id: ClaveConteo;
  bandeja: Bandeja;
  uno: string;
  varios: (n: number) => string;
  href: string | null;
}

// El orden de cada bandeja es el de urgencia: una clase sin cubrir puede ser
// HOY; una recompensa por entregar espera a que la alumna vuelva.
const LINEAS: DefLinea[] = [
  { id: 'sustitucionesPorDecidir', bandeja: 'decidir', href: '/sustituciones',
    uno: 'Una clase sin cubrir necesita que decidas', varios: n => `${n} clases sin cubrir necesitan que decidas` },
  { id: 'reservasPorAprobar', bandeja: 'decidir', href: '/calendario',
    uno: 'Una reserva espera tu aprobación', varios: n => `${n} reservas esperan tu aprobación` },
  { id: 'recibosFallidos', bandeja: 'decidir', href: '/cobros?tab=deudas',
    uno: 'Un cobro que Tentare no ha conseguido cobrar', varios: n => `${n} cobros que Tentare no ha conseguido cobrar` },
  { id: 'penalizacionesPorAprobar', bandeja: 'decidir', href: null,
    uno: 'Una penalización espera tu visto bueno para cobrarse', varios: n => `${n} penalizaciones esperan tu visto bueno para cobrarse` },
  { id: 'devolucionesPorRevisar', bandeja: 'decidir', href: null,
    uno: 'Una devolución por revisar', varios: n => `${n} devoluciones por revisar` },
  { id: 'automatizacionesEsperando', bandeja: 'decidir', href: '/automatizaciones',
    uno: 'Una automatización espera tu visto bueno', varios: n => `${n} automatizaciones esperan tu visto bueno` },
  { id: 'canjesPorEntregar', bandeja: 'decidir', href: null,
    uno: 'Una recompensa canjeada por entregar', varios: n => `${n} recompensas canjeadas por entregar` },

  { id: 'sustitucionesBuscando', bandeja: 'enMarcha', href: '/sustituciones',
    uno: 'Buscando sustituta para una clase', varios: n => `Buscando sustituta para ${n} clases` },
  { id: 'ofertasListaEspera', bandeja: 'enMarcha', href: '/calendario',
    uno: 'Una plaza libre ofrecida a la lista de espera', varios: n => `${n} plazas libres ofrecidas a la lista de espera` },
  { id: 'cobrosEnReintento', bandeja: 'enMarcha', href: '/cobros?tab=deudas',
    uno: 'Reintentando un cobro que falló', varios: n => `Reintentando ${n} cobros que fallaron` },

  { id: 'sustitucionesCubiertas24h', bandeja: 'resuelto', href: '/sustituciones',
    uno: 'Una clase cubierta por una sustituta', varios: n => `${n} clases cubiertas por sustitutas` },
  { id: 'accionesAutonomasHoy', bandeja: 'resuelto', href: '/centro-de-control',
    uno: 'Una acción del Centro de Control hecha sola', varios: n => `${n} acciones del Centro de Control hechas solas` },
  { id: 'mensajesAutomaticosHoy', bandeja: 'resuelto', href: '/automatizaciones',
    uno: 'Un mensaje enviado por tus automatizaciones', varios: n => `${n} mensajes enviados por tus automatizaciones` },
];

export function tituloDecidir(n: number): string {
  if (n <= 0) return 'Nada espera tu visto bueno';
  return n === 1 ? 'Una cosa espera tu visto bueno' : `${n} cosas esperan tu visto bueno`;
}

/**
 * Sufijo de la línea «clases sin cubrir» cuando en alguna Tentare Network tiene
 * a quién proponer. Cuenta CLASES, nunca nombres. Acotado a `nClases`: son un
 * subconjunto de las mismas filas, pero salen de dos consultas y una carrera
 * entre ambas no puede decir «en 3» de 2 clases.
 */
export function sufijoNetwork(nClases: number, nConNetwork: number | null | undefined): string {
  if (typeof nConNetwork !== 'number' || !Number.isFinite(nConNetwork) || nConNetwork <= 0) return '';
  if (nClases === 1) return ' — te proponemos profesionales de Tentare Network';
  return ` — en ${Math.min(nConNetwork, nClases)} te proponemos profesionales de Tentare Network`;
}

/** Cuántas filas traen `candidatos_network` como array jsonb NO vacío (NULL = no se buscó). */
export function contarConCandidatosNetwork(filas: ReadonlyArray<{ candidatos_network?: unknown }>): number {
  return filas.filter(f => Array.isArray(f.candidatos_network) && f.candidatos_network.length > 0).length;
}

export function construirEstadoEstudio(c: ConteosEstudio): EstadoEstudio {
  const aplica = LINEAS.some(l => c[l.id] !== undefined);
  const porBandeja: Record<Bandeja, LineaEstado[]> = { decidir: [], enMarcha: [], resuelto: [] };

  for (const def of LINEAS) {
    const n = c[def.id];
    // undefined (sin permiso), null (falló) o 0: no hay nada que contar.
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) continue;
    let texto = n === 1 ? def.uno : def.varios(n);
    if (def.id === 'sustitucionesPorDecidir') texto += sufijoNetwork(n, c.sustitucionesConNetwork);
    porBandeja[def.bandeja].push({ id: def.id, n, href: def.href, texto });
  }

  const nDecidir = porBandeja.decidir.reduce((s, l) => s + l.n, 0);
  return { aplica, ...porBandeja, nDecidir, titulo: tituloDecidir(nDecidir) };
}
