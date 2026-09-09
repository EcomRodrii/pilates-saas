'use client';
import { useSyncExternalStore } from 'react';

// El reloj de la app de la alumna. Antes no había ninguno: la PWA resolvía todo
// a granularidad de DÍA (`hoyISO()`), que sirve igual en servidor y en cliente,
// y el único instante que se usaba se congelaba al montar
// (`const [ahoraMs] = useState(() => Date.now())`, en mis-reservas).
//
// «Esta clase se está dando ahora» necesita otra cosa: un instante que AVANCE.
// Una clase que empieza a las 16:00 tiene que pasar a «en curso» sin que la
// alumna recargue, y a las 16:55 tiene que dejar de serlo.
//
// Tres decisiones, y las tres tienen su porqué:
//
// 1. UN temporizador para toda la app, no uno por componente. El horario pinta
//    veinte `ClassCard`, y veinte `setInterval` en un móvil es gasto de batería
//    por nada. Store de módulo con suscriptores: el intervalo arranca con el
//    primer componente que mira la hora y se para cuando se va el último.
//
// 2. `useSyncExternalStore` y no `useState` + `useEffect`. `getServerSnapshot`
//    devuelve `null`, así que la guarda de hidratación es estructural: el
//    servidor no pinta ninguna hora y por tanto no puede desajustarse con el
//    cliente. El patrón alternativo —el que hay repetido a mano en una docena de
//    pantallas del panel— necesita un `setState` dentro de un `useEffect` y su
//    `eslint-disable` para saltarse `react-hooks/set-state-in-effect`.
//    ⚠️ El snapshot es un NÚMERO, no un `Date`: `getSnapshot` tiene que devolver
//    el mismo valor por identidad entre renders o React entra en bucle, y un
//    `new Date()` nuevo cada vez lo provoca.
//
// 3. Se relee al volver a la pestaña (`visibilitychange`). Esto es una PWA de
//    móvil: el navegador ralentiza o detiene los intervalos de una pestaña en
//    segundo plano, así que sin esto la alumna que dejó la app abierta a las
//    15:50 y la mira a las 16:30 —el caso literal de la petición— podría ver el
//    estado de hace media hora. El intervalo solo cubre a quien está mirando.

/** Cada cuánto se relee el reloj. Un minuto: el estado de una clase no cambia
 *  más rápido, y bajar de ahí solo gasta batería. El precio es que «en curso»
 *  puede tardar hasta un minuto en aparecer, que es el mismo compromiso que ya
 *  acepta la agenda del panel (`components/dashboard/hoy-en-el-estudio.tsx`). */
export const CADENCIA_RELOJ_MS = 60_000;

let ahoraMs: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const suscriptores = new Set<() => void>();

function avisar(): void {
  for (const fn of suscriptores) fn();
}

function releer(): void {
  const nuevo = Date.now();
  // Solo se avisa si el minuto ha cambiado de verdad. Sin esto, cada tic
  // rerenderizaría el horario entero aunque nada de lo que se ve dependa del
  // segundo.
  if (ahoraMs !== null && Math.floor(nuevo / CADENCIA_RELOJ_MS) === Math.floor(ahoraMs / CADENCIA_RELOJ_MS)) return;
  ahoraMs = nuevo;
  avisar();
}

function alVolverAlFrente(): void {
  if (document.visibilityState === 'visible') releer();
}

function suscribir(fn: () => void): () => void {
  suscriptores.add(fn);
  if (timer === null) {
    // Primera lectura inmediata: quien acaba de montar necesita la hora ahora,
    // no dentro de un minuto.
    ahoraMs = Date.now();
    timer = setInterval(releer, CADENCIA_RELOJ_MS);
    document.addEventListener('visibilitychange', alVolverAlFrente);
  }
  return () => {
    suscriptores.delete(fn);
    if (suscriptores.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', alVolverAlFrente);
      // `ahoraMs` NO se pone a null al parar: si vuelve a montarse un
      // componente, tener la última hora conocida es mejor que un parpadeo sin
      // estado, y `suscribir` la refresca en el mismo acto.
    }
  };
}

const leer = (): number | null => ahoraMs;
const leerEnServidor = (): number | null => null;

/**
 * El instante actual en milisegundos, o `null` mientras no se ha hidratado.
 *
 * `null` no es «no se sabe la hora»: es «el servidor no pinta hora». Quien lo
 * use tiene que tratarlo como «todavía no» y no pintar nada temporal —nunca como
 * `0` ni como `Date.now()` de reserva, que es justo lo que devuelve el desajuste
 * de hidratación.
 */
export function useAhoraMs(): number | null {
  return useSyncExternalStore(suscribir, leer, leerEnServidor);
}
