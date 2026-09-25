// El género gramatical de las palabras que hablan de UNA persona concreta.
//
// Petición del fundador (25-sep-2026): poder indicar si una persona es mujer u
// hombre y que con eso cambien las palabras del panel — «clienta fija» /
// «cliente fijo», «alumna» / «alumno».
//
// ⚠️ Es un dato GRAMATICAL, no un perfil. Solo decide cómo se escribe lo que se
// dice DE esa persona (su etiqueta, «esta clienta», «la clienta no tiene email»).
// Lo que habla de un grupo («tus clientas», «Nueva clienta») no depende de ella
// y no pasa por aquí.
//
// Sin indicar (`null`/`undefined`) se habla en FEMENINO, que es lo que ha dicho
// siempre el producto: activar esto no cambia ni una palabra a nadie hasta que
// se elige. Pura y sin dependencias, para poder testearla con `node --test`.

export type Genero = 'MUJER' | 'HOMBRE';

export const GENEROS: readonly Genero[] = ['MUJER', 'HOMBRE'];

export const ETIQUETA_GENERO: Record<Genero, string> = { MUJER: 'Mujer', HOMBRE: 'Hombre' };

export function esGenero(v: unknown): v is Genero {
  return v === 'MUJER' || v === 'HOMBRE';
}

/** Lo que llega de la base (`string | null`), reducido a lo que se sabe. Cualquier otra cosa = sin indicar. */
export function generoDe(crudo: unknown): Genero | null {
  return esGenero(crudo) ? crudo : null;
}

/**
 * Las palabras de una persona, en minúscula. Para la primera de la frase,
 * `mayuscula()`.
 *
 * Los determinantes van aquí y no se construyen a mano en cada pantalla porque
 * son lo que más se olvida: «esta clienta» → «este cliente», «a la clienta» →
 * «al cliente» (no «a el»), «de la clienta» → «del cliente».
 */
export interface Trato {
  clienta: string;
  alumna: string;
  socia: string;
  /** «fija» / «fijo» */
  fija: string;
  la: string;
  esta: string;
  una: string;
  /** «a la» / «al» */
  alA: string;
  /** «de la» / «del» */
  deLa: string;
  /** «ella» / «él» */
  ella: string;
  /** Terminación de los adjetivos: «a» / «o» (actualizada / actualizado). */
  fin: string;
}

const FEMENINO: Trato = {
  clienta: 'clienta', alumna: 'alumna', socia: 'socia', fija: 'fija',
  la: 'la', esta: 'esta', una: 'una', alA: 'a la', deLa: 'de la', ella: 'ella', fin: 'a',
};

const MASCULINO: Trato = {
  clienta: 'cliente', alumna: 'alumno', socia: 'socio', fija: 'fijo',
  la: 'el', esta: 'este', una: 'un', alA: 'al', deLa: 'del', ella: 'él', fin: 'o',
};

export function trato(genero: Genero | null | undefined): Trato {
  return genero === 'HOMBRE' ? MASCULINO : FEMENINO;
}

export function mayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** «Clienta fija» / «Cliente fijo»: la etiqueta que se pone al lado de quien tiene una plaza fija. */
export function etiquetaFija(genero: Genero | null | undefined): string {
  const t = trato(genero);
  return `${mayuscula(t.clienta)} ${t.fija}`;
}
