'use client';

import { useEffect, useState } from 'react';

/**
 * La hora actual como una referencia ESTABLE entre renders.
 *
 * El problema que resuelve: `const now = mounted ? new Date() : FALLBACK` crea
 * un objeto NUEVO en cada render. Si `now` está en las dependencias de algún
 * `useMemo`/`useCallback` —y en este repo lo está, en los más caros: ocupación
 * del calendario, agregados de informes, banners y retos del portal— esos
 * cálculos se rehacen en CADA render, incluido uno tan ajeno como abrir un
 * toast. La memoización estaba escrita pero no servía de nada.
 *
 * Por qué no un `useMemo(() => new Date(), [montado])`: ya se probó en el
 * dashboard y se pasaba de frenada (ver el comentario de su auditoría I-4/M-4).
 * Congela `now` PARA SIEMPRE tras montar, así que una pestaña abierta hasta
 * medianoche sigue creyendo que "hoy" es ayer y el saludo nunca pasa de
 * "Buenos días". Con estado + intervalo, `now` es estable entre renders pero
 * sigue avanzando: cambia una vez por intervalo, no una vez por render.
 *
 * Devuelve también `montado` porque quien necesita la hora real casi siempre
 * necesita saber si ya hidrató (para no pintar en servidor algo que dependa del
 * reloj), y así no hace falta un segundo `useState` + `useEffect` por pantalla.
 *
 * @param fallbackSSR Fecha fija que se usa en el render de servidor y en la
 *   hidratación. Tiene que ser la MISMA en servidor y cliente o React se queja
 *   de mismatch — por eso es un parámetro y no `new Date()`.
 * @param intervaloMs Cada cuánto se refresca. 60s por defecto; el portal usa
 *   30s porque enseña cuentas atrás de reservas.
 */
export function useAhora(fallbackSSR: Date, intervaloMs = 60_000): { ahora: Date; montado: boolean } {
  // Inicializador perezoso: `fallbackSSR` solo se lee en el primer render, así
  // que da igual que quien llama lo construya en cada render.
  const [ahora, setAhora] = useState(() => fallbackSSR);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reloj: sincroniza con el paso del TIEMPO, un sistema externo, que es el caso de uso que la regla considera legítimo. Además es la guarda de hidratación: el servidor pinta `fallbackSSR` y el cliente salta a la hora real tras montar; ese segundo render es el objetivo, no un efecto colateral.
    setMontado(true);
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);

  return { ahora, montado };
}
