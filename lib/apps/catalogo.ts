// «Apps e integraciones» (12-nov-2026, petición del fundador, calcada sobre el
// módulo de Momence): el catálogo de la Tienda de apps.
//
// Una tarjeta por cosa que el estudio puede encender, con su categoría, su
// precio y su estado. Tres orígenes, y NINGUNO se inventa aquí:
//   · complementos de pago → salen de `ADDONS` (precio y frase incluidos): si el
//     precio cambia en entitlements, cambia aquí sin tocar nada;
//   · integraciones → las mismas conexiones de Configuración › Integraciones,
//     con su pestaña en /apps/integraciones;
//   · próximamente → solo lo que el repo ya dice que viene (ver cada entrada).
// Los módulos del menú (Calendario, Cobros…) no están aquí: salen de
// `gruposTuTentare`, que ya conoce el menú real, y la tienda los suma al pintar.
//
// Puro y sin `@/`: lo prueba `node --test` (catalogo.test.ts).

import { ADDONS, LISTA_ADDONS, type Addon } from '../billing/entitlements.ts';

export type CategoriaApp = 'agenda' | 'cobros' | 'comunicacion' | 'marketing' | 'plataformas' | 'automatizar' | 'equipo';

export const CATEGORIAS: readonly { id: CategoriaApp; label: string }[] = [
  { id: 'agenda', label: 'Agenda y accesos' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'comunicacion', label: 'Comunicación' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'plataformas', label: 'Plataformas' },
  { id: 'automatizar', label: 'Automatizar' },
  { id: 'equipo', label: 'Equipo' },
] as const;

export type PrecioApp =
  | { tipo: 'incluida' }
  | { tipo: 'mensual'; eur: number }
  | { tipo: 'proximamente' };

export type Plataforma = 'CLASSPASS' | 'URBAN_SPORTS_CLUB' | 'WELLHUB';

export interface AppDeTienda {
  id: string;
  nombre: string;
  frase: string;
  categoria: CategoriaApp;
  origen: 'complemento' | 'integracion' | 'proximamente';
  precio: PrecioApp;
  /** A dónde lleva «Activar» / «Conectar» (nunca a una pantalla que no exista). */
  href: string;
  /** Solo los complementos de pago: cuál es. */
  addon?: Addon;
  /** Solo las plataformas que venden tus clases. */
  plataforma?: Plataforma;
  /** Pestaña de /apps/integraciones. */
  pestana?: string;
}

const hrefIntegracion = (pestana: string) => `/apps/integraciones?pestana=${pestana}`;

const COMPLEMENTOS: AppDeTienda[] = LISTA_ADDONS.map((a): AppDeTienda => ({
  id: `complemento-${a}`,
  nombre: ADDONS[a].nombre,
  frase: ADDONS[a].resumen,
  categoria: a === 'sustituciones' ? 'equipo' : a === 'ia' ? 'comunicacion' : 'automatizar',
  origen: 'complemento',
  precio: { tipo: 'mensual', eur: ADDONS[a].precioMes },
  href: '/suscripcion#complementos',
  addon: a,
}));

const INTEGRACIONES: AppDeTienda[] = ([
  { id: 'stripe', nombre: 'Stripe', frase: 'Cobra bonos y cuotas con tarjeta en tu propia cuenta: el dinero entra directo en ella.', categoria: 'cobros', pestana: 'stripe' },
  { id: 'datafono', nombre: 'Datáfono', frase: 'Mandas el importe desde la Caja y la venta queda cobrada sola.', categoria: 'cobros', pestana: 'datafono' },
  { id: 'whatsapp', nombre: 'WhatsApp', frase: 'Recordatorios y avisos desde tu número de WhatsApp Business.', categoria: 'comunicacion', pestana: 'whatsapp' },
  { id: 'google-calendar', nombre: 'Google Calendar', frase: 'Copia tus clases de las próximas semanas a tu calendario.', categoria: 'agenda', pestana: 'google-calendar' },
  { id: 'zoom', nombre: 'Zoom', frase: 'Crea una reunión de Zoom para cada clase de los tipos marcados como online.', categoria: 'agenda', pestana: 'zoom' },
  { id: 'kisi', nombre: 'Kisi', frase: 'Abre la puerta de tu estudio sola con cada check-in de tus clientes.', categoria: 'agenda', pestana: 'kisi' },
  { id: 'klaviyo', nombre: 'Klaviyo', frase: 'Lleva a Klaviyo los clientes que aceptaron recibir marketing.', categoria: 'marketing', pestana: 'klaviyo' },
  { id: 'mailchimp', nombre: 'Mailchimp', frase: 'Lleva a tu audiencia de Mailchimp los clientes que aceptaron recibir marketing.', categoria: 'marketing', pestana: 'mailchimp' },
  { id: 'zapier', nombre: 'Zapier', frase: 'Conecta Tentare con miles de apps. La conexión se autoriza desde Zapier.', categoria: 'automatizar', pestana: 'zapier' },
] as const).map((i): AppDeTienda => ({ ...i, origen: 'integracion', precio: { tipo: 'incluida' }, href: hrefIntegracion(i.pestana) }));

const PLATAFORMAS: AppDeTienda[] = ([
  { id: 'classpass', nombre: 'ClassPass', plataforma: 'CLASSPASS', pestana: 'classpass' },
  { id: 'urban-sports-club', nombre: 'Urban Sports Club', plataforma: 'URBAN_SPORTS_CLUB', pestana: 'urban-sports-club' },
  { id: 'wellhub', nombre: 'Wellhub', plataforma: 'WELLHUB', pestana: 'wellhub' },
] as const).map((p): AppDeTienda => ({
  ...p,
  frase: 'Apunta sus reservas en tu clase para no vender dos veces el mismo hueco.',
  categoria: 'plataformas',
  origen: 'integracion',
  precio: { tipo: 'incluida' },
  href: hrefIntegracion(p.pestana),
}));

// Solo lo que el repo ya dice que viene; nada de promesas nuevas.
const PROXIMAMENTE: AppDeTienda[] = [
  {
    id: 'proximamente-datafono-banco', nombre: 'Datáfono de tu banco',
    frase: 'Hoy cobras con el lector de Stripe; el del banco llega más adelante.',
    categoria: 'cobros',
  },
  {
    id: 'proximamente-app-propia', nombre: 'App propia en la tienda de apps',
    frase: 'Tu estudio con su nombre y su icono en la App Store y Google Play.',
    categoria: 'comunicacion',
  },
  {
    id: 'proximamente-tarjeta-regalo', nombre: 'Tarjeta regalo',
    frase: 'Vende saldo para regalar; llega cuando esté cerrado el tratamiento del IVA.',
    categoria: 'cobros',
  },
].map((p): AppDeTienda => ({ ...p, origen: 'proximamente', precio: { tipo: 'proximamente' }, href: '/apps' } as AppDeTienda));

/** Todas las apps que no son módulos del menú, en el orden en que se enseñan. */
export const APPS_DE_TIENDA: readonly AppDeTienda[] = [
  ...COMPLEMENTOS, ...INTEGRACIONES, ...PLATAFORMAS, ...PROXIMAMENTE,
];

/** El texto del precio, sin símbolos sueltos. */
export function textoPrecio(p: PrecioApp): string {
  if (p.tipo === 'incluida') return 'Incluida';
  if (p.tipo === 'proximamente') return 'Próximamente';
  return `${p.eur} €/mes`;
}

/**
 * ¿Se puede encender hoy? Solo lo «próximamente» no. Las plataformas SÍ: se
 * activan en modo manual (se apuntan sus reservas en la clase); lo que llega más
 * adelante es la conexión automática, y eso lo dice su propia pestaña.
 */
export function disponible(a: AppDeTienda): boolean {
  return a.origen !== 'proximamente';
}

/** Las pestañas de «Integraciones de terceros», en orden, con su nombre y el grupo de la lista. */
export const PESTANAS_INTEGRACION = [
  { id: 'stripe', label: 'Stripe', grupo: 'Cobros' },
  { id: 'datafono', label: 'Datáfono', grupo: 'Cobros' },
  { id: 'whatsapp', label: 'WhatsApp', grupo: 'Comunicación' },
  { id: 'google-calendar', label: 'Google Calendar', grupo: 'Agenda y accesos' },
  { id: 'zoom', label: 'Zoom', grupo: 'Agenda y accesos' },
  { id: 'kisi', label: 'Kisi', grupo: 'Agenda y accesos' },
  { id: 'klaviyo', label: 'Klaviyo', grupo: 'Marketing' },
  { id: 'mailchimp', label: 'Mailchimp', grupo: 'Marketing' },
  { id: 'classpass', label: 'ClassPass', grupo: 'Plataformas' },
  { id: 'urban-sports-club', label: 'Urban Sports Club', grupo: 'Plataformas' },
  { id: 'wellhub', label: 'Wellhub', grupo: 'Plataformas' },
  { id: 'zapier', label: 'Zapier', grupo: 'Automatizar' },
] as const;

export type PestanaIntegracion = (typeof PESTANAS_INTEGRACION)[number]['id'];

export function esPestanaIntegracion(v: unknown): v is PestanaIntegracion {
  return PESTANAS_INTEGRACION.some(p => p.id === v);
}
