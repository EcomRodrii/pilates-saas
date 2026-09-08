'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Créditos en vivo: la alumna ve su saldo cambiar sin recargar.
//
// EL CASO QUE CIERRA
// Termina su clase, el mostrador le hace el check-in y con él gana créditos. Su
// app, abierta en la mano, sigue diciendo el saldo de antes. La base estaba
// bien desde el primer instante; lo que faltaba era una vía para que la
// pantalla ABIERTA se enterara. Con F5 salía bien, que es la peor forma de
// enterarse de que has ganado algo.
//
// ⚠️ El aviso NO lleva el `socio_id`, y no es un olvido: el canal es del
// estudio entero y lo escuchan otras socias. Cada app vuelve a pedir LO SUYO
// por su camino de siempre, que ya la autoriza — mismo criterio que el canal
// de aforo, donde difundir la fila de `reservas` habría metido un `socio_id`
// en un canal ajeno.
//
// La contrapartida honesta: cuando alguien gana créditos, TODAS las apps
// abiertas de ese estudio vuelven a pedir lo suyo. Es lo que cuesta no filtrar
// de quién es el saldo, y a la escala de un estudio de Pilates son unas pocas
// peticiones que además ya estaban cacheadas 60 s.
// ─────────────────────────────────────────────────────────────────────────────

import { useCanalEnVivo, type FuenteCanales } from './canal-en-vivo';

export function useCreditosEnVivo(
  cliente: FuenteCanales,
  { studioId, alCambiar, activo = true, auth = cliente.auth }: {
    studioId: string | null | undefined;
    /** Se llama cuando el saldo de ALGUIEN del estudio cambió. Sin decir de quién. */
    alCambiar: () => void;
    activo?: boolean;
    auth?: FuenteCanales['auth'];
  },
): { conectado: boolean } {
  return useCanalEnVivo<never>(cliente, {
    studioId, activo, auth,
    canal: 'creditos',
    evento: 'creditos',
    // No hay nada que extraer: el aviso ES la señal.
    extraer: () => null,
    alCambiar: () => alCambiar(),
  });
}
