// Textos de los webhooks que también pinta el navegador: aquí y no en
// gestion-reglas.ts, que arrastra node:net y node:dns (destino.ts).

/** Por qué está desactivado, en palabras de la propietaria. */
export function textoMotivoDesactivado(motivo: string | null): string {
  switch (motivo) {
    case 'fallos': return 'Se desactivó solo: llevaba días sin poder entregar ningún aviso.';
    case 'destino_retirado': return 'Se desactivó solo: el destino respondió que esa dirección ya no existe (410).';
    case 'api_desactivada': return 'Se desactivó al desactivarse la API del estudio.';
    default: return 'Desactivado.';
  }
}
