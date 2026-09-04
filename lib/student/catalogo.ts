'use client';

import { cargarDatosPublicos } from '@/lib/api-client';
import type {
  Instructor, PlanTarifa, Recibo, Reserva, Sala, Sesion, Suscripcion, TipoClase,
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
  studio: { nombre: string; fotoUrl: string | null; slug: string } | null;
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  planesTarifa: PlanTarifa[];
  aforoReservas: { id: string; sesion_id: string; estado: string; spot_id: string | null }[];
  socia: {
    suscripciones: Suscripcion[];
    reservas: Reserva[];
    recibos: Recibo[];
  } | null;
}

type Payload = PayloadPublico;

interface Entrada { cuando: number; datos: Payload }

/**
 * 15 s. Suficiente para que una navegación entre pantallas no vuelva a pedir
 * el payload, y corto para que el aforo no se quede rancio.
 *
 * ⚠️ Esto NO es la fuente de verdad del aforo. Para eso está el sondeo ligero
 * de `GET /api/public/aforo` (cacheado 5 s en CDN, sin PII), que es el que la
 * pantalla de horario debe usar. Este caché evita repetir la carga PESADA.
 */
const TTL_MS = 15_000;

const cache = new Map<string, Entrada>();
const enVuelo = new Map<string, Promise<Payload | null>>();

/** Tira el caché de un estudio. Se llama tras reservar o cancelar. */
export function invalidarCatalogo(slug: string): void {
  cache.delete(slug);
}

export async function catalogo(slug: string, opts?: { forzar?: boolean }): Promise<Payload | null> {
  if (opts?.forzar) cache.delete(slug);

  const guardado = cache.get(slug);
  if (guardado && Date.now() - guardado.cuando < TTL_MS) return guardado.datos;

  const yaVa = enVuelo.get(slug);
  if (yaVa) return yaVa;

  const p = cargarDatosPublicos(slug)
    .then((datos) => {
      if (datos) cache.set(slug, { cuando: Date.now(), datos: datos as Payload });
      return (datos as Payload | null) ?? null;
    })
    // `finally` y no `then`: si la petición falla, la entrada también tiene que
    // soltarse, o un fallo puntual deja a todo el mundo pegado a una promesa
    // rechazada. Mismo razonamiento que `unaVez()`.
    .finally(() => { enVuelo.delete(slug); });

  enVuelo.set(slug, p);
  return p;
}
