'use client';

import { useEffect } from 'react';
import type { Clase } from './tipos.ts';
import {
  borrarAjuste, guardarAjuste, huellaEvento, leerAjuste, planCalendario, type DatosEvento, type ResultadoSincronizacion,
} from './calendario-auto.ts';

export type { ResultadoSincronizacion } from './calendario-auto.ts';
import { añadirAlCalendario } from './enlaces-clase.ts';
import { getClases, getInstructoras, getReservasSiHaySocia } from './datos.ts';
import { personaEnElDispositivo } from './persona-dispositivo.ts';
import {
  borrarEventoCalendario, crearEventoCalendario, crearEventoConHoja, esAppNativa, existeEventoCalendario,
  modificarEventoCalendario, pedirAccesoCalendario,
} from '../nativo/puente.ts';

// El calendario del iPhone, desde la app de la alumna:
//
//   · «Mis reservas en mi calendario» (Perfil): cada reserva confirmada entra
//     sola en el calendario, se pone al día si el estudio la mueve y sale si se
//     cancela (`sincronizarCalendario`). Pide acceso COMPLETO: sin él no se
//     puede volver a encontrar el evento para cambiarlo o quitarlo.
//   · «+ Calendario» de un toque (`alCalendario`): con la sincronización
//     encendida, directo y apuntado; apagada, la hoja de iOS ya rellena, que no
//     pide ningún permiso. Fuera de la app, lo de siempre (.ics / Google).
//
// ⚠️ TODO pasa por una sola cola (`enCola`) y la memoria se relee antes de cada
// cambio y se guarda DESPUÉS de cada evento: «+ Calendario», la sincronización
// y apagar el interruptor pueden llegar a la vez, y sin cola se creaban
// duplicados o quedaban eventos huérfanos que nadie iba a quitar.
// ⚠️ La memoria es POR PERSONA (`personaEnElDispositivo`) y se borra al cerrar
// sesión y al borrar la cuenta (`olvidarCalendarioDeLaPersona`, lib/student/auth.ts).
//
// La lógica de qué crear, cambiar y quitar es pura (calendario-auto.ts).

export interface DatosEstudio { slug: string; nombre: string; direccion: string }

function datosDe(c: Clase, e: DatosEstudio, instructora?: string): DatosEvento {
  return {
    titulo: `${c.nombre} · ${e.nombre}`,
    inicioMs: new Date(c.inicio).getTime(),
    finMs: new Date(c.fin).getTime(),
    lugar: e.direccion || e.nombre,
    notas: [instructora ? `Con ${instructora}` : null, c.sala].filter(Boolean).join(' · '),
  };
}

let cola: Promise<unknown> = Promise.resolve();
/** Una cosa a la vez sobre el calendario y su memoria. */
function enCola<T>(fn: () => Promise<T>): Promise<T> {
  const r = cola.then(fn, fn);
  cola = r.catch(() => {});
  return r;
}

const NADA: ResultadoSincronizacion = { omitida: true, creados: 0, actualizados: 0, quitados: 0, fallidos: 0 };

/**
 * Pone el calendario al día con lo que dice el servidor. Lee sus datos del
 * catálogo ya cacheado (ni una petición más) y NO hace nada si el payload no
 * trae a la socia: «no sé quién es» no puede tratarse como «no tiene reservas».
 */
export function sincronizarCalendario(e: DatosEstudio): Promise<ResultadoSincronizacion> {
  if (!esAppNativa()) return Promise.resolve(NADA);
  return enCola(async () => {
    const persona = personaEnElDispositivo();
    if (!persona || !leerAjuste(e.slug, persona).activo) return NADA;
    const [reservas, clases, instructoras] = await Promise.all([
      getReservasSiHaySocia(e.slug), getClases(e.slug), getInstructoras(e.slug),
    ]);
    if (reservas === null) return NADA;
    // La sesión pudo cambiar mientras se leía: la memoria es de quien estaba.
    if (personaEnElDispositivo() !== persona) return NADA;
    const nombre = (id: string) => instructoras.find((i) => i.id === id)?.nombre;
    const datos = (c: Clase) => datosDe(c, e, nombre(c.instructoraId));

    const plan = planCalendario(reservas, clases, leerAjuste(e.slug, persona).mapa, Date.now(), datos);
    const r: ResultadoSincronizacion = { omitida: false, creados: 0, actualizados: 0, quitados: 0, fallidos: 0 };
    // Cada cambio se apunta en cuanto se hace: si la app se cierra a mitad, lo
    // hecho queda apuntado y lo que falta se hace la próxima vez.
    const apuntar = (f: (m: ReturnType<typeof leerAjuste>['mapa']) => void) => {
      const a = leerAjuste(e.slug, persona);
      if (!a.activo) return false; // la apagó entretanto
      f(a.mapa);
      guardarAjuste(e.slug, persona, a);
      return true;
    };

    if (plan.olvidar.length) apuntar((m) => { for (const id of plan.olvidar) delete m[id]; });
    for (const [claseId, eventoId] of plan.quitar) {
      // Aunque falle (la borró ella a mano, o retiró el permiso), sale de la
      // memoria: con ese id no hay nada más que hacer.
      if (await borrarEventoCalendario(eventoId)) r.quitados++;
      apuntar((m) => { delete m[claseId]; });
    }
    for (const [c, eventoId] of plan.actualizar) {
      const d = datos(c);
      if (await modificarEventoCalendario(eventoId, d)) {
        r.actualizados++;
        apuntar((m) => { m[c.id] = { id: eventoId, huella: huellaEvento(d) }; });
        continue;
      }
      // No se pudo cambiar (lo borró ella): se crea de nuevo con la hora buena.
      const id = await crearEventoCalendario(d);
      if (id) { r.actualizados++; apuntar((m) => { m[c.id] = { id, huella: huellaEvento(d) }; }); }
      else { r.fallidos++; apuntar((m) => { delete m[c.id]; }); }
    }
    for (const c of plan.crear) {
      if (!leerAjuste(e.slug, persona).activo) break;
      if (leerAjuste(e.slug, persona).mapa[c.id]) continue; // ya lo apuntó otro camino
      const d = datos(c);
      const id = await crearEventoCalendario(d);
      if (!id) { r.fallidos++; continue; }
      if (apuntar((m) => { m[c.id] = { id, huella: huellaEvento(d) }; })) r.creados++;
      else await borrarEventoCalendario(id); // la apagó mientras se creaba: no dejar huérfanos
    }
    return r;
  });
}

/** Enciende el interruptor. `false` si no dio permiso: el interruptor se queda apagado. */
export function activarCalendario(e: DatosEstudio): Promise<boolean> {
  return enCola(async () => {
    const persona = personaEnElDispositivo();
    if (!persona) return false;
    if (!(await pedirAccesoCalendario())) return false;
    guardarAjuste(e.slug, persona, { activo: true, mapa: leerAjuste(e.slug, persona).mapa });
    return true;
  });
}

/**
 * Apaga el interruptor y quita los eventos que la app había puesto (los de
 * clases que aún no han pasado: las pasadas ya salieron de la memoria). Dejarlos
 * sería peor: si luego cancela, nadie los quitaría.
 */
export function desactivarCalendario(slug: string): Promise<void> {
  return enCola(async () => {
    const persona = personaEnElDispositivo();
    if (!persona) return;
    const { mapa } = leerAjuste(slug, persona);
    guardarAjuste(slug, persona, { activo: false, mapa: {} });
    for (const ev of Object.values(mapa)) await borrarEventoCalendario(ev.id);
  });
}

/**
 * Al cerrar sesión o borrar la cuenta: su memoria fuera del dispositivo, y sus
 * eventos fuera del calendario (con la sesión cerrada, nadie los pondría al día).
 * Se le pasa la persona porque cuando se llama la sesión ya puede no estar.
 */
export function olvidarCalendarioDeLaPersona(slug: string, persona: string | null): Promise<void> {
  if (!persona) return Promise.resolve();
  return enCola(async () => {
    const { mapa } = leerAjuste(slug, persona);
    borrarAjuste(slug, persona);
    if (!esAppNativa()) return;
    for (const ev of Object.values(mapa)) await borrarEventoCalendario(ev.id);
  });
}

export function calendarioActivo(slug: string): boolean {
  return leerAjuste(slug, personaEnElDispositivo()).activo;
}

export type ResultadoCalendario = 'añadida' | 'ya-estaba' | 'otro';

/**
 * «+ Calendario». Con la sincronización encendida: directo al calendario y
 * apuntada, así que la sincronización no la duplica y la quita si cancela; si ya
 * estaba apuntada, se COMPRUEBA que siga ahí (pudo borrarla a mano) antes de
 * decir «ya está». Apagada: la hoja de iOS, sin pedir acceso al calendario.
 * Fuera de la app: el camino de siempre.
 */
export function alCalendario(e: DatosEstudio, c: Clase, instructora?: string): Promise<ResultadoCalendario> {
  if (!esAppNativa()) {
    añadirAlCalendario(c, e.nombre, e.direccion, instructora);
    return Promise.resolve('otro');
  }
  const d = datosDe(c, e, instructora);
  return enCola(async (): Promise<ResultadoCalendario> => {
    const persona = personaEnElDispositivo();
    const ajuste = leerAjuste(e.slug, persona);
    if (persona && ajuste.activo) {
      const apuntado = ajuste.mapa[c.id];
      if (apuntado && (await existeEventoCalendario(apuntado.id, d)) !== false) return 'ya-estaba';
      const id = await crearEventoCalendario(d);
      if (id) {
        const a = leerAjuste(e.slug, persona);
        a.mapa[c.id] = { id, huella: huellaEvento(d) };
        guardarAjuste(e.slug, persona, a);
        return 'añadida';
      }
    }
    const conHoja = await crearEventoConHoja(d);
    if (conHoja === true) return 'añadida';
    if (conHoja === false) return 'otro'; // la cerró sin añadir: no es un error
    // Sin la hoja (plugin no disponible): el .ics de siempre.
    añadirAlCalendario(c, e.nombre, e.direccion, instructora);
    return 'otro';
  });
}

/**
 * Para las pantallas que ya cargan sus reservas (Inicio, Mis clases): cada vez
 * que cambian sus datos (`disparador`), el calendario se pone al día. Con el
 * interruptor apagado o fuera de la app, no hace nada.
 */
export function useSincronizarCalendario(e: DatosEstudio, disparador: unknown): void {
  const { slug, nombre, direccion } = e;
  useEffect(() => {
    if (!disparador) return;
    void sincronizarCalendario({ slug, nombre, direccion });
  }, [slug, nombre, direccion, disparador]);
}
