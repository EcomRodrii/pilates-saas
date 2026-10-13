// Catálogo de "Explorar todas las funciones" — a diferencia de
// lib/onboarding.ts (que solo enseña lo PENDIENTE de configurar), esto
// enseña TODO lo que hace Tentare, esté hecho o no, para que un propietario
// descubra funcionalidad que no sabía que existía.
//
// Deriva la lista de rutas reales de lib/nav-config.ts (MODULOS, ya filtrado
// por feature-freeze y por el flag de marketing) en vez de mantener una
// lista aparte a mano: así nunca puede enseñar un módulo congelado ni
// resucitar marketing por otra puerta, y se actualiza sola si algún día se
// reactiva algo.
//
// La frase de cada módulo vive UNA vez, en la ficha de su pantalla
// (lib/ayuda/pantallas.ts, `valor`: «un único catálogo por pantalla, con la ruta
// como clave», decisión del fundador del 12-oct-2026). La usan esta pantalla y
// «Tu Tentare». El nombre sale siempre del menú, nunca escrito a mano.
import { MODULOS } from './nav-config.ts';
import { valorDeModulo } from './ayuda/pantallas.ts';

export interface FuncionCatalogo {
  href: string;
  label: string;
  descripcion: string;
}
export interface CategoriaFunciones {
  id: string;
  label: string;
  funciones: FuncionCatalogo[];
}

// Qué enseña «Explorar todas las funciones», por lo que resuelve. Solo hrefs:
// el nombre sale del menú y la frase, de la ficha de su pantalla.
const CATEGORIAS_BASE: { id: string; label: string; hrefs: string[] }[] = [
  { id: 'reservas', label: 'Reservas y calendario', hrefs: ['/calendario', '/citas', '/sustituciones'] },
  { id: 'clientas', label: 'Clientas', hrefs: ['/clientas', '/mensajeria', '/libreta'] },
  { id: 'cobros', label: 'Cobros y pagos', hrefs: ['/cobros', '/productos', '/cierre'] },
  { id: 'equipo', label: 'Equipo', hrefs: ['/equipo'] },
  { id: 'automatizaciones', label: 'Automatizaciones', hrefs: ['/automatizaciones'] },
  { id: 'datos', label: 'Informes y decisiones', hrefs: ['/informes', '/centro-de-control'] },
  { id: 'configuracion', label: 'Configuración y marca', hrefs: ['/configuracion', '/migracion'] },
];

export function calcularCatalogoFunciones(): CategoriaFunciones[] {
  const porHref = new Map(MODULOS.map(m => [m.href, m]));
  return CATEGORIAS_BASE
    .map(cat => ({
      id: cat.id,
      label: cat.label,
      funciones: cat.hrefs.flatMap(href => {
        const m = porHref.get(href);
        const descripcion = valorDeModulo(href);
        return m && descripcion ? [{ href, label: m.label, descripcion }] : [];
      }),
    }))
    .filter(cat => cat.funciones.length > 0);
}
