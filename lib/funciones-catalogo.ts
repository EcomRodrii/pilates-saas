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
import { MODULOS } from './nav-config.ts';

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

const CATEGORIAS_BASE: CategoriaFunciones[] = [
  {
    id: 'reservas', label: 'Reservas y calendario',
    funciones: [
      { href: '/calendario', label: 'Calendario', descripcion: 'Crea clases, arrastra para reprogramar y gestiona el horario completo del estudio.' },
      { href: '/citas', label: 'Citas', descripcion: 'Servicios con hora concreta: valoraciones, sesiones 1 a 1, lo que no encaja en una clase colectiva.' },
      { href: '/sustituciones', label: 'Sustituciones', descripcion: 'Cuando una instructora avisa de que no puede, Tentare busca sustituta sola y avisa a las alumnas antes de que cuelgues el teléfono.' },
    ],
  },
  {
    id: 'clientas', label: 'Clientas',
    funciones: [
      { href: '/clientas', label: 'Clientas', descripcion: 'Ficha completa: bonos, asistencia, notas de progreso y quién lleva tiempo sin venir.' },
      { href: '/mensajeria', label: 'Mensajería', descripcion: 'Conversaciones con tus clientas centralizadas, sin depender de WhatsApp personal.' },
      { href: '/libreta', label: 'Libreta de clientas', descripcion: 'Vista rápida de contacto y notas, pensada para mostrador.' },
    ],
  },
  {
    id: 'cobros', label: 'Cobros y pagos',
    funciones: [
      { href: '/cobros', label: 'Cobros', descripcion: 'Qué está pendiente y qué ya se cobró — con Stripe conectado, la mayoría se cobra sola.' },
      { href: '/productos', label: 'Membresías', descripcion: 'Planes, bonos y precios que tus clientas pueden contratar.' },
      { href: '/cierre', label: 'Cierre de año', descripcion: 'Resumen de ingresos e IVA listo para tu gestoría — no presenta impuestos, los prepara.' },
    ],
  },
  {
    id: 'equipo', label: 'Equipo',
    funciones: [
      { href: '/equipo', label: 'Equipo', descripcion: 'Instructoras, permisos por rol y estadísticas de cada una.' },
    ],
  },
  {
    id: 'automatizaciones', label: 'Funciones inteligentes',
    funciones: [
      { href: '/automatizaciones', label: 'Automatizaciones', descripcion: 'Recordatorios, recuperación de clientas ausentes y más, funcionando solas una vez activas.' },
    ],
  },
  {
    id: 'datos', label: 'Informes y decisiones',
    funciones: [
      { href: '/informes', label: 'Informes', descripcion: 'Ingresos, ocupación y qué clases dan dinero de verdad.' },
      { href: '/centro-de-control', label: 'Centro de Control', descripcion: 'Recomendaciones para tu estudio calculadas a partir de tus propios datos, no un panel de números sueltos.' },
    ],
  },
  {
    id: 'configuracion', label: 'Configuración y marca',
    funciones: [
      { href: '/configuracion', label: 'Configuración', descripcion: 'Planes, marca, salas, integraciones y todo lo que define cómo funciona tu estudio.' },
      { href: '/migracion', label: 'Traer mis datos', descripcion: 'Importa clientas y bonos desde Bsport, Momence u otra plataforma.' },
    ],
  },
];

export function calcularCatalogoFunciones(): CategoriaFunciones[] {
  const hrefsVisibles = new Set(MODULOS.map(m => m.href));
  return CATEGORIAS_BASE
    .map(cat => ({ ...cat, funciones: cat.funciones.filter(f => hrefsVisibles.has(f.href)) }))
    .filter(cat => cat.funciones.length > 0);
}
