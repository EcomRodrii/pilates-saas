// ─────────────────────────────────────────────────────────────────────────────
// Ninguna cifra inventada (spec §3.3). Las herramientas hacen TODAS las cuentas
// y devuelven las cifras ya formateadas; el modelo solo las copia. Este filtro
// lo comprueba frase a frase antes de que llegue a la pantalla: una frase con
// un número que no sale de los datos (resultados de herramientas de la
// conversación, preguntas de la propietaria y la fecha del día) NO se emite.
//
// Reutiliza la regla de `sinCifrasInventadas` del Decision OS
// (lib/decision/redaccion.ts): los números se comparan como tokens de dígitos.
// Coste: la latencia de una frase (Haiku contesta en 2–4).
//
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import { tokensNumericos } from '../decision/redaccion.ts';

const MARCAS = /\[(?:ALUMNA|EQUIPO|PERSONA|EMAIL|TELEFONO)_\d+\]/g;
// Fin de frase: . ? ! : seguidos de espacio o salto (no «1.234» ni «18:00»).
const FIN_DE_FRASE = /[.?!:…](?=\s)/g;

export function numerosPermitidos(fuentes: readonly string[]): Set<string> {
  const s = new Set<string>();
  for (const f of fuentes) for (const t of tokensNumericos(f.replace(MARCAS, ' '))) s.add(t);
  return s;
}

export function fraseRespaldada(frase: string, permitidos: ReadonlySet<string>): boolean {
  return tokensNumericos(frase.replace(MARCAS, ' ')).every(t => permitidos.has(t));
}

export interface FiltroCifras {
  /** Nuevos números de confianza (el resultado de una herramienta recién ejecutada). */
  permitir: (texto: string) => void;
  /** Un trozo del texto en curso: devuelve lo que ya se puede emitir (frases enteras y respaldadas). */
  empujar: (delta: string) => string;
  /** Fin del mensaje: lo que quedaba pendiente, si está respaldado. */
  terminar: () => string;
  /** ¿Se ha quitado alguna frase? */
  quitadas: () => number;
}

export function filtroDeCifras(fuentes: readonly string[]): FiltroCifras {
  const permitidos = numerosPermitidos(fuentes);
  let pendiente = '';
  let nQuitadas = 0;

  const pasar = (frase: string): string => {
    if (fraseRespaldada(frase, permitidos)) return frase;
    nQuitadas++;
    // Fuera entera, con su blanco: la anterior ya acababa en blanco.
    return '';
  };

  return {
    permitir(texto) {
      for (const t of tokensNumericos(texto.replace(MARCAS, ' '))) permitidos.add(t);
    },
    empujar(delta) {
      pendiente += delta;
      let salida = '';
      let corte = 0;
      FIN_DE_FRASE.lastIndex = 0;
      for (let m = FIN_DE_FRASE.exec(pendiente); m; m = FIN_DE_FRASE.exec(pendiente)) {
        // La frase incluye su signo y el blanco que la sigue.
        let fin = m.index + 1;
        while (fin < pendiente.length && /\s/.test(pendiente[fin])) fin++;
        if (fin >= pendiente.length) break; // el blanco puede seguir llegando
        salida += pasar(pendiente.slice(corte, fin));
        corte = fin;
        FIN_DE_FRASE.lastIndex = fin;
      }
      pendiente = pendiente.slice(corte);
      return salida;
    },
    terminar() {
      const resto = pendiente;
      pendiente = '';
      return resto ? pasar(resto) : '';
    },
    quitadas: () => nQuitadas,
  };
}
