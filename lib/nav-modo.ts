// El modo del menú lateral, «Esencial» o «Todo» («avanzado» en el dato): es de
// cada navegador (localStorage `nav-mode`) y de serie es «Esencial»
// (ESSENTIAL_HREFS, lib/nav-config.ts). Lo lee `useNavMode` (sidebar.tsx).
//
// Quien lo cambia desde fuera del propio menú («Ver el menú entero» de «Tu
// Tentare») dispara `EVENTO_MODO_MENU` para que el menú se ponga al día sin
// recargar. Todo con try/catch: sin almacenamiento (privado, bloqueado) se
// queda en «Esencial» y no rompe nada.

export const EVENTO_MODO_MENU = 'tentare-nav-mode';
const CLAVE = 'nav-mode';

export type ModoMenu = 'esencial' | 'avanzado';

export function leerModoMenu(): ModoMenu {
  try {
    return localStorage.getItem(CLAVE) === 'avanzado' ? 'avanzado' : 'esencial';
  } catch {
    return 'esencial';
  }
}

export function guardarModoMenu(modo: ModoMenu): void {
  try {
    localStorage.setItem(CLAVE, modo);
  } catch {
    // Sin almacenamiento: el modo vale para esta visita y nada más.
  }
  // El modo va EN el evento: sin almacenamiento, releerlo devolvería «Esencial»
  // y el cambio rebotaría al instante.
  window.dispatchEvent(new CustomEvent<ModoMenu>(EVENTO_MODO_MENU, { detail: modo }));
}

/** El modo que trae el evento (o, si no lo trae, el guardado). */
export function modoDelEvento(e: Event): ModoMenu {
  const d = (e as CustomEvent<unknown>).detail;
  return d === 'avanzado' || d === 'esencial' ? d : leerModoMenu();
}
