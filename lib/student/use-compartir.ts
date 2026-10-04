'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { compartirTexto, hayHojaDeCompartir } from '@/lib/nativo/puente';
import { textoParaCopiar } from '@/lib/nativo/compartir';
import { copiarAlPortapapeles } from '@/lib/utils';

const nada = () => () => {};

/**
 * Compartir una frase con su enlace: la hoja nativa en la app, la del navegador
 * si la tiene, y si no, copiar al portapapeles como antes.
 *
 * `hayHoja` decide la etiqueta del botón («Compartir» o «Copiar»); en el
 * servidor y al hidratar es `false` (lo de siempre) y cambia al montarse.
 *
 * `copiado`: `null` mientras no haya habido que copiar; `true`/`false` según si
 * el portapapeles lo aceptó DE VERDAD (decir «Copiado» sin comprobarlo ya salió
 * mal en este repo: tres pantallas lo afirmaban con el portapapeles vacío).
 */
export function useCompartir() {
  const hayHoja = useSyncExternalStore(nada, hayHojaDeCompartir, () => false);
  const [copiado, setCopiado] = useState<boolean | null>(null);

  const compartir = useCallback(async (c: { titulo: string; texto: string; url?: string }) => {
    setCopiado(null);
    const r = await compartirTexto(c);
    if (r === 'copiar') setCopiado(await copiarAlPortapapeles(textoParaCopiar(c.texto, c.url)));
  }, []);

  const olvidar = useCallback(() => setCopiado(null), []);
  return { hayHoja, compartir, copiado, olvidar };
}
