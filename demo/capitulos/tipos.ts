import type { Grabador } from '../nucleo.ts';

export interface Capitulo {
  /** El id de la sección de Configuración (`?tab=`). */
  id: string;
  titulo: string;
  /** La frase de la portada (la de la propia sección de Configuración). */
  frase: string;
  guion: (g: Grabador, pos: { numero: number; total: number }) => Promise<void>;
}
