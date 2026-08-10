'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pantallasCambiadas, esperaReintento, avisarAlSalir,
  type EstadoGuardado, type PorPantalla,
} from '@/lib/theme/autoguardado';
import type { PantallaId } from '@/lib/portal-home-bloques';
import { esSesionCaducada } from '@/lib/api-client';

/** Espera tras la última tecla antes de mandar. */
const ESPERA_MS = 1_500;

/**
 * Guarda el borrador solo, sin publicar.
 *
 * ⚠️ **Nunca revierte el estado local.** Si el guardado falla, lo que la
 * propietaria tiene en pantalla sigue siendo suyo y se reintenta en segundo
 * plano; devolverle la versión del servidor le borraría lo que acaba de
 * escribir, que es exactamente el desastre del que esto protege.
 *
 * ⚠️ **Las peticiones van SERIALIZADAS por pantalla.** Sin eso, una respuesta
 * lenta puede llegar después de una más nueva y dejar en el servidor una
 * versión anterior a la que hay en pantalla — el bug clásico de los
 * autoguardados, y silencioso: nadie ve nada raro hasta que recarga.
 */
export function useAutoguardado(
  bloquesPorPantalla: PorPantalla,
  guardar: (pantalla: PantallaId, bloques: PorPantalla[PantallaId]) => Promise<unknown>,
  activo: boolean,
) {
  const [estado, setEstado] = useState<EstadoGuardado>({ tipo: 'limpio' });
  // Lo último que el SERVIDOR tiene confirmado. `null` = todavía sin línea
  // base. Se compara contra esto y no contra el render anterior: si un
  // guardado falla, lo pendiente sigue pendiente hasta que entre de verdad.
  const confirmado = useRef<PorPantalla | null>(null);
  const ultimo = useRef<PorPantalla>(bloquesPorPantalla);
  const enVuelo = useRef(false);
  const fallos = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reintentar = useRef<() => void>(() => {});

  // Las refs se escriben en efectos, NUNCA durante el render: hacerlo en el
  // cuerpo rompe `react-hooks/refs` y, con el React Compiler, un render
  // descartado dejaría la ref adelantada respecto a lo que se pintó.
  useEffect(() => { ultimo.current = bloquesPorPantalla; }, [bloquesPorPantalla]);

  // ⚠️ La línea base se fija cuando TERMINA la carga, no al montar.
  //
  // Al montar, `bloquesPorPantalla` son los bloques de FÁBRICA. Con esa base,
  // en cuanto llegara el borrador del servidor las tres pantallas diferirían
  // y se guardarían las tres — lo cazó una medición: `PUTS home=1 clases=1
  // bonos=1` tocando solo una.
  //
  // Y no era solo ruido: `useBloquesEditor` hace `.catch(() => null)` por
  // pantalla, así que una pantalla cuya carga falle se queda con los bloques
  // de fábrica. Con la base equivocada, el autoguardado los habría subido,
  // BORRANDO lo que el estudio tenía guardado ahí. Sin ningún error visible.
  //
  // `confirmado.current === null` es la marca de "todavía sin base": el mismo
  // patrón que recomienda `react-hooks/refs` para inicializar una vez.
  useEffect(() => {
    if (!activo || confirmado.current !== null) return;
    confirmado.current = bloquesPorPantalla;
  }, [activo, bloquesPorPantalla]);

  const intentar = useCallback(async () => {
    if (enVuelo.current) return; // ya hay una tanda en curso: no se solapan
    const base = confirmado.current;
    if (base === null) return; // sin línea base no hay nada contra qué comparar
    enVuelo.current = true;

    let confirmadoLocal = base;
    let seMandoAlgo = false;
    try {
      // Bucle en vez de llamarse a sí misma: mientras vuela una tanda pueden
      // entrar más ediciones, y hay que recogerlas antes de decir "Guardado".
      for (;;) {
        const pendientes = pantallasCambiadas(confirmadoLocal, ultimo.current);
        if (pendientes.length === 0) break;
        setEstado({ tipo: 'guardando' });
        // Se fotografía lo que se manda: si mientras vuela llega otra edición,
        // se confirma SOLO lo enviado y la nueva entra en la vuelta siguiente.
        // Confirmar `ultimo.current` daría por guardado algo que el servidor
        // nunca llegó a ver.
        const enviado = ultimo.current;
        for (const p of pendientes) await guardar(p, enviado[p]);
        confirmadoLocal = {
          ...confirmadoLocal,
          ...Object.fromEntries(pendientes.map((p) => [p, enviado[p]])),
        } as PorPantalla;
        confirmado.current = confirmadoLocal;
        seMandoAlgo = true;
      }
      enVuelo.current = false;
      fallos.current = 0;
      setEstado(seMandoAlgo ? { tipo: 'guardado', en: Date.now() } : { tipo: 'limpio' });
    } catch (e) {
      enVuelo.current = false;
      // ⚠️ Con la sesión caducada NO se reintenta. El servidor va a seguir
      // respondiendo 401 hasta que se vuelva a entrar, así que insistir cada
      // minuto solo sirve para que el aviso siga diciendo «se sigue
      // intentando» —que es falso— mientras la propietaria cree que su
      // trabajo va camino del servidor. Lo que hay pendiente NO se toca: sigue
      // en pantalla y se guardará en cuanto vuelva a haber sesión.
      if (esSesionCaducada(e)) {
        if (temporizador.current) clearTimeout(temporizador.current);
        setEstado({ tipo: 'sesion' });
        return;
      }
      // El contador de fallos vive en una ref y no en el propio `setEstado`:
      // programar el reintento dentro del actualizador lo haría impuro y en
      // modo estricto React lo llama dos veces → dos temporizadores.
      const intentos = fallos.current;
      fallos.current = intentos + 1;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => reintentar.current(), esperaReintento(intentos));
      setEstado({ tipo: 'error', intentos });
    }
  }, [guardar]);

  // El reintento entra por una ref, no por recursión: una función no puede
  // referenciarse a sí misma dentro de su propio `useCallback`.
  useEffect(() => { reintentar.current = () => void intentar(); }, [intentar]);

  // Cada edición reinicia la espera. Escribir un título entero es UNA
  // petición, no una por letra.
  useEffect(() => {
    if (!activo || confirmado.current === null) return;
    if (pantallasCambiadas(confirmado.current, bloquesPorPantalla).length === 0) return;
    // Con la sesión caducada se deja de programar envíos: seguir mandando
    // 401 cada vez que se teclea no arregla nada y borraría el aviso, que es
    // lo único que le dice a la propietaria que pare y vuelva a entrar.
    setEstado((prev) => (prev.tipo === 'error' || prev.tipo === 'sesion' ? prev : { tipo: 'pendiente' }));
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void intentar(), ESPERA_MS);
    return () => { if (temporizador.current) clearTimeout(temporizador.current); };
  }, [bloquesPorPantalla, activo, intentar]);

  // Avisar antes de cerrar solo si de verdad hay algo que perder.
  useEffect(() => {
    if (!avisarAlSalir(estado)) return;
    const alSalir = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [estado]);

  return { estado, guardarYa: intentar };
}
