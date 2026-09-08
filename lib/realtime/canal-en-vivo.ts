'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La fontanería de escuchar un canal del estudio y avisar de que hay que volver
// a pedir los datos.
//
// Vivía dentro de `aforo-en-vivo.ts`. Se saca aquí al aparecer el segundo
// canal (`creditos-en-vivo.ts`): lo que hay debajo —renovación del token,
// agrupado de ráfagas, limpieza al desmontar— es lo delicado, y dos copias
// divergen. La que se quedara vieja fallaría en silencio, que es exactamente el
// síntoma del bug que estos canales vienen a cerrar.
//
// ⚠️ Esto NO TRAE DATOS. El mensaje solo dice «algo cambió». Cada pantalla
// vuelve a pedir lo suyo POR SU CAMINO DE SIEMPRE, con su propia autorización.
// Es lo que permite que los canales sean del estudio entero sin filtrar nada.
//
// ⚠️ Broadcast, NO `postgres_changes`: medido en este repo, `realtime.apply_rls()`
// decodificando WAL era el 58 % de la CPU de la base, y se paga aunque no haya
// nada que entregar.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FuenteAuth {
  getSession(): Promise<{ data: { session: { access_token?: string } | null } }>;
  onAuthStateChange(
    cb: (evento: string, sesion: { access_token?: string } | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
}

export interface FuenteCanales {
  realtime: { setAuth(token: string | null): void | Promise<void> };
  channel: SupabaseClient['channel'];
  removeChannel: SupabaseClient['removeChannel'];
  auth: FuenteAuth;
}

/**
 * Cuánto se espera antes de refrescar tras el primer aviso.
 *
 * Cancelar una clase entera cambia N reservas en una transacción y produce N
 * avisos casi a la vez. Sin esto, ocho alumnas fuera = ocho recargas. Es
 * agrupar, no sondear: si no llega ningún aviso, no se pide nada nunca.
 */
const AGRUPAR_MS = 250;

export interface OpcionesCanal<T> {
  /** `null` mientras no se sepa el estudio: no se suscribe a nada. */
  studioId: string | null | undefined;
  /** Prefijo del topic: `<canal>:<studioId>`. */
  canal: string;
  /** Nombre del evento de broadcast. */
  evento: string;
  /**
   * Qué sacar del mensaje, o `null` si no trae nada útil.
   *
   * Un canal puede no llevar identificadores a propósito —los créditos no
   * mandan el `socio_id`, porque el canal lo escuchan otras socias—, y en ese
   * caso `alCambiar` recibe una lista vacía: el aviso es la señal.
   */
  extraer: (payload: unknown) => T | null;
  /** Se llama ya agrupado, con todo lo que llegó en la ráfaga. */
  alCambiar: (cambios: T[]) => void;
  /** Apagar sin desmontar (p. ej. una pantalla que no lo necesita). */
  activo?: boolean;
  /** De dónde sale la sesión. Por defecto, la del propio `cliente`. */
  auth?: FuenteAuth;
}

export function useCanalEnVivo<T>(
  cliente: FuenteCanales,
  { studioId, canal: nombreCanal, evento, extraer, alCambiar, activo = true, auth = cliente.auth }: OpcionesCanal<T>,
): { conectado: boolean } {
  // La callback cambia en cada render (se define inline en la pantalla). Si
  // entrara como dependencia del efecto, el canal se cerraría y se volvería a
  // abrir en cada render — que es como se pierden avisos sin que nada falle.
  // Se sincroniza en su propio efecto y no en el render: el compilador de React
  // rechaza escribir un ref durante el render, y con razón.
  const alCambiarRef = useRef(alCambiar);
  useEffect(() => { alCambiarRef.current = alCambiar; });
  const extraerRef = useRef(extraer);
  useEffect(() => { extraerRef.current = extraer; });

  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    if (!activo || !studioId) return;

    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let canal: ReturnType<typeof cliente.channel> | null = null;

    // Lo que llegó en esta ráfaga. Se vacía al entregar.
    const pendientes = new Set<T>();
    const refrescarAgrupado = (msg: { payload?: unknown }) => {
      const dato = extraerRef.current(msg?.payload);
      if (dato !== null && dato !== undefined) pendientes.add(dato);
      if (temporizador) return; // ya hay uno en camino
      temporizador = setTimeout(() => {
        temporizador = null;
        const cambios = [...pendientes];
        pendientes.clear();
        if (vivo) alCambiarRef.current(cambios);
      }, AGRUPAR_MS);
    };

    void (async () => {
      // El token se resuelve aquí y no se recibe como prop: es una sola línea
      // dentro de un efecto que ya es asíncrono, y quita del llamador la
      // posibilidad de pasarlo caducado o de olvidarlo.
      const { data: { session } } = await auth.getSession();
      if (!vivo) return;
      await cliente.realtime.setAuth(session?.access_token ?? null);
      if (!vivo) return;
      canal = cliente
        .channel(`${nombreCanal}:${studioId}`, { config: { private: true } })
        .on('broadcast', { event: evento }, refrescarAgrupado)
        .subscribe(estado => {
          if (vivo) setConectado(estado === 'SUBSCRIBED');
        });
    })();

    // El token caduca solo. Sin esto, el canal se queda mudo pasada una hora y
    // el síntoma es idéntico al del bug que esto arregla.
    const { data: sub } = auth.onAuthStateChange((evt, sesion) => {
      if (evt === 'TOKEN_REFRESHED' && vivo) {
        void cliente.realtime.setAuth(sesion?.access_token ?? null);
      }
    });

    return () => {
      vivo = false;
      setConectado(false);
      if (temporizador) clearTimeout(temporizador);
      sub.subscription.unsubscribe();
      if (canal) void cliente.removeChannel(canal);
    };
  }, [cliente, auth, studioId, activo, nombreCanal, evento]);

  return { conectado };
}
