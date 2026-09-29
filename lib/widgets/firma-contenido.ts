// La huella de lo que la página ENTIENDE del código pegado (Fase C).
//
// La calculan sobre lo mismo quien genera el código y quien lo pinta, sin
// ningún parámetro nuevo en el código que se copia:
//  - el panel, sobre la URL que genera (`firmaContenidoDe`, ./integracion.ts);
//  - /reservar, sobre su propia URL al cargar dentro de la web del estudio;
//  - y, desde la Fase E, el bundle de la nativa sobre el `dataset` de su
//    `<div>` (`fuenteDeDataset`), que el panel reproduce con `paresNativa`.
// Si coinciden, lo que se ve en su web es lo que hay aquí. `firmaCodigo` no
// sirve para esto: lleva el ancho, la carga diferida, el texto del botón y la
// plantilla de Tentare, y nada de eso llega a la página.
//
// Solo importa ./huella.ts: /reservar y el bundle de la nativa lo cargan y no
// tienen por qué arrastrar el generador de código.
//
// Cómo se canoniza, y por qué así:
//  - Solo las claves de `CLAVES_FIRMA`. Lo demás se ignora: `utm_*` o `fbclid`
//    que alguien añada, `embed` (siempre 1 en lo incrustado, y el popup lo
//    fuerza), `ventana` (la pone el popup; la forma va en su propia columna),
//    lo del panel (`vista-previa`, `borrador-web`) y los parámetros de
//    ejecución (`directo`, `compra`…).
//  - Valores ya decodificados con `get()` (la primera si se repite, igual que
//    la página) y con `trim`, como los lee la página. Así `%2C` o `,` y `+` o
//    `%20` dan lo mismo: el popup reserializa la URL (`urlPopupPermitida`).
//  - Las listas de ids, ordenadas y sin huecos: filtran por conjunto, y el
//    orden en el que se marcaron en el panel no cambia lo que se ve.
//  - ⚠️ Y NADA MÁS. Valores que significan lo mismo no se igualan
//    (`ocultar-precio=0` no es lo mismo que no ponerlo): el panel compara
//    contra lo que él mismo generó, y un valor retocado a mano es de verdad
//    otra versión del código.
//
// ⚠️ Cambiar cualquier cosa de esto (la lista, el formato de la línea, el
// separador) cambia TODAS las firmas: lo que ya se ve en las webs pasaría a
// salir como «una versión distinta». Si hace falta, se sube `VERSION_FIRMA` a
// la vez (lo vigila un test con la firma literal del código por defecto).

import { huella } from './huella.ts';

/** Prefijo de toda firma. Se sube solo si cambia la forma de canonizar. */
export const VERSION_FIRMA = 'c1';

/**
 * Lo que la página lee del código incrustado: lo que emite el generador
 * (./integracion.ts), los extras del catálogo (`cuenta`, `prueba`) y lo que la
 * página sigue honrando de snippets anteriores al constructor (`negro`,
 * `identidad`, `radio*`, `relleno`, `texto-secundario`, `solo-pestana`), que un
 * código pegado hace tiempo puede llevar. Ordenada: la firma no depende del
 * orden de la URL.
 */
export const CLAVES_FIRMA = [
  'cuenta', 'densidad', 'diseno', 'fondo', 'forma', 'fuente', 'fuente-display', 'identidad',
  'instructoras', 'linea', 'marca', 'negro', 'ocultar-nivel', 'ocultar-precio', 'ocultar-sustituta', 'pie', 'planes',
  'presentacion', 'prueba', 'radio', 'radio-boton', 'radio-input', 'ref', 'relleno', 'salas', 'sesion', 'solo-pestana',
  'superficie', 'tab', 'texto', 'texto-secundario', 'tinta', 'tipos', 'vista',
] as const;

const LISTAS: ReadonlySet<string> = new Set(['tipos', 'instructoras', 'salas', 'planes']);

function lista(v: string): string {
  return v.split(',').map(s => s.trim()).filter(Boolean).sort().join(',');
}

/**
 * La firma de una URL de /reservar (o de sus `searchParams`): `c1` + la huella
 * de sus líneas `clave=valor`. Una clave ausente no entra; una presente pero
 * vacía (`tipos=`) sí: el panel nunca emite una así, de modo que es un código
 * retocado a mano, y eso es otra versión.
 */
export function firmaDeUrl(p: { get(k: string): string | null }): string {
  const lineas: string[] = [];
  for (const k of CLAVES_FIRMA) {
    const v = p.get(k);
    if (v == null) continue;
    lineas.push(`${k}=${LISTAS.has(k) ? lista(v) : v.trim()}`);
  }
  return VERSION_FIRMA + huella(lineas.join('\n'));
}
