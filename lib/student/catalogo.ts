'use client';

import { cargarAforoPublico, cargarDatosPublicos } from '@/lib/api-client';
import { aplicarAforo } from '@/lib/student/aforo-fresco';
import { borrarPorSlug, claveCatalogo } from '@/lib/student/catalogo-clave';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type {
  FavoritoClase, Instructor, PlanTarifa, PlazaFija, Recibo, Recuperacion, Reserva, Sala, Sesion, Suscripcion, TipoClase,
} from '@/lib/types';

// El cargador del que beben todos los adaptadores.
//
// `POST /api/public/studio-data` devuelve en UNA llamada el catálogo del
// estudio y, si viaja el JWT de la socia, sus 17 sub-objetos (reservas, bonos,
// recibos, facturas, citas, plazas fijas, recuperaciones…). Los adaptadores del
// diseño son nueve funciones sueltas —`getClases`, `getBonos`, `getPagos`…— y
// si cada una pidiera lo suyo, abrir Inicio dispararía media docena de
// peticiones del mismo payload.
//
// Por eso hay este intermedio: una petición por slug, compartida.
//
// Por qué NO es React Query: el repo no tiene ningún gestor de estado de
// servidor (verificado: ni @tanstack ni swr en las dependencias), y meter uno
// para nueve funciones sería introducir una infraestructura paralela a la que
// ya existe. `unaVez()` de lib/api-client.ts resuelve esto mismo con 8 líneas;
// aquí se replica su idea añadiendo un TTL corto, que es lo único que le falta.

/**
 * Forma del payload de `POST /api/public/studio-data`.
 *
 * ⚠️ `cargarDatosPublicos` devuelve `res.json()`, o sea `any`: no existe un tipo
 * compartido en el repo y /reservar consume el payload sin tiparlo. Declararlo
 * aquí es lo que convierte esta capa en una frontera de verdad — si el servidor
 * cambia un campo, el error sale en el adaptador y no tres pantallas más allá.
 *
 * Solo se declaran los campos que la app de la alumna usa. El payload trae más
 * (gamificación, citas, plazas fijas, recuperaciones); se añadirán cuando entre
 * su pantalla, no antes.
 */
export interface PayloadPublico {
  studio: {
    nombre: string; fotoUrl: string | null; slug: string;
    /** Cuenta conectada de Stripe. `null` = el estudio aún no puede cobrar. */
    stripeAccountId?: string | null;
  } | null;
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  planesTarifa: PlanTarifa[];
  /** Servicios de cita vendibles online — el payload ya los filtra por
      `activo` y `auto_reservable`. */
  citasServicios?: {
    id: string; nombre: string; descripcion?: string | null; precio?: number | null;
    duracionMin?: number | null; activo?: boolean | null; autoReservable?: boolean | null; tipo?: string | null;
  }[];
  aforoReservas: { id: string; sesion_id: string; estado: string; spot_id: string | null }[];
  socia: {
    suscripciones: Suscripcion[];
    reservas: Reserva[];
    recibos: Recibo[];
    favoritos?: FavoritoClase[];
    plazasFijas?: PlazaFija[];
    recuperaciones?: Recuperacion[];
  } | null;
}

type Payload = PayloadPublico;

interface Entrada { cuando: number; datos: Payload }

/**
 * 60 s. Una navegación entre pantallas no vuelve a pedir el payload PESADO
 * (~20 consultas en servidor); medido: con 15 s cada pantalla lo volvía a
 * traer entero. El aforo NO depende de esto: el horario y la hoja de clase lo
 * refrescan con `GET /api/public/aforo` (ligero, sin PII, 5 s en CDN) vía
 * `refrescarAforo`, y toda escritura (reservar, cancelar, favorito, compra)
 * invalida el catálogo.
 */
const TTL_MS = 60_000;

// Clave = estudio + IDENTIDAD (`catalogo-clave.ts`): el payload lleva la `socia`
// de quien está dentro, y cachearlo solo por estudio servía a la siguiente
// alumna del mismo dispositivo las reservas, bonos y ficha de la anterior.
const cache = new Map<string, Entrada>();
const enVuelo = new Map<string, Promise<Payload | null>>();

/** Quién está dentro, leído del almacén (sin red). `null` = anónima. */
async function identidad(): Promise<string | null> {
  try {
    const { data: { session } } = await supabasePortal.auth.getSession();
    const persona = session?.user?.id ?? null;
    if (ultimaPersona === undefined) ultimaPersona = persona;
    return persona;
  } catch {
    return null;
  }
}

// Cambia la PERSONA → nada de lo cacheado vale. Cubre también la otra pestaña
// (auth-js reparte SIGNED_OUT/SIGNED_IN por BroadcastChannel). Ojo: auth-js
// emite SIGNED_IN en cada vuelta de pestaña visible, no solo al entrar — con la
// misma persona no se tira nada (la clave ya lleva su id).
let ultimaPersona: string | null | undefined;
if (typeof window !== 'undefined') {
  supabasePortal.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { ultimaPersona = null; cache.clear(); enVuelo.clear(); return; }
    if (event === 'SIGNED_IN') {
      const persona = session?.user?.id ?? null;
      if (ultimaPersona !== undefined && persona !== ultimaPersona) { cache.clear(); enVuelo.clear(); }
      ultimaPersona = persona;
    }
  });
}

/** Tira el caché de un estudio (de todas las personas). Se llama tras reservar, cancelar, cerrar sesión… */
export function invalidarCatalogo(slug: string): void {
  borrarPorSlug(cache, slug);
  // También los vuelos en curso: uno lanzado ANTES de la escritura traería el
  // payload de antes y lo guardaría como si fuera el de después.
  borrarPorSlug(enVuelo, slug);
}

/**
 * Aforo fresco sobre el payload cacheado: pide `/api/public/aforo` (ligero) y
 * reemplaza SOLO las filas de las clases próximas, dejando el histórico. Si no
 * hay payload en caché o el aforo falla, no hace nada: el siguiente `catalogo()`
 * trae el aforo con el payload. Devuelve el payload ya parcheado.
 */
export async function refrescarAforo(slug: string): Promise<Payload | null> {
  const clave = claveCatalogo(slug, await identidad());
  const guardado = cache.get(clave);
  if (!guardado) return null;
  // Recién traído del servidor: el aforo de la CDN (hasta 5 s más viejo) no
  // puede pisar al que acaba de llegar con el payload, ni merece otra petición.
  if (Date.now() - guardado.cuando < 5_000) return guardado.datos;
  try {
    const a = await cargarAforoPublico(slug);
    if (!a) return guardado.datos;
    const datos: Payload = { ...guardado.datos, aforoReservas: aplicarAforo(guardado.datos.aforoReservas ?? [], a.sesionIds, a.aforoReservas) };
    // Solo si la entrada sigue siendo la misma: entre la petición y la
    // respuesta pudo haber una reserva (invalidarCatalogo) o un cierre de
    // sesión, y volver a meterla resucitaría un payload ya obsoleto.
    if (cache.get(clave) === guardado) cache.set(clave, { cuando: guardado.cuando, datos });
    return datos;
  } catch {
    return guardado.datos;
  }
}

export async function catalogo(slug: string, opts?: { forzar?: boolean }): Promise<Payload | null> {
  const clave = claveCatalogo(slug, await identidad());
  if (opts?.forzar) cache.delete(clave);

  const guardado = cache.get(clave);
  if (guardado && Date.now() - guardado.cuando < TTL_MS) return guardado.datos;

  const yaVa = enVuelo.get(clave);
  if (yaVa) return yaVa;

  const p = cargarDatosPublicos(slug)
    .then((datos) => {
      // Solo si este sigue siendo el vuelo vigente: si entre medias cambió la
      // sesión (se vació todo), un payload de la persona anterior no se guarda.
      if (datos && enVuelo.get(clave) === p) cache.set(clave, { cuando: Date.now(), datos: datos as Payload });
      return (datos as Payload | null) ?? null;
    })
    // `finally` y no `then`: si la petición falla, la entrada también tiene que
    // soltarse, o un fallo puntual deja a todo el mundo pegado a una promesa
    // rechazada. Mismo razonamiento que `unaVez()`.
    .finally(() => { if (enVuelo.get(clave) === p) enVuelo.delete(clave); });

  enVuelo.set(clave, p);
  return p;
}
