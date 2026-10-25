import Link from 'next/link';
import { VideoProducto } from '@/components/landing/VideoProducto';
import { AgendaDia, Escena, Ficha, PanelCobros, PanelInformes, PasarLista } from './piezas';
import { PestanasCliente, type Pestana } from './PestanasCliente';

// ─────────────────────────────────────────────────────────────────────────────
// El producto por resultados (fase 2.2): la forma de Momence. Cinco pestañas
// (Reservas · Cobros · Alumnas · Equipo · Informes) que cambian la captura
// grande y los tres puntos de cada área; cada una con el enlace a SU página de
// /funcionalidades (Momence no enlaza ninguna: aquí sí).
//
// Los datos de las pestañas viven en `PESTANAS_PRODUCTO`, y no dentro del JSX,
// para que lib/landing/home-nueva.test.ts compruebe que cada enlace lleva a una
// ruta que existe y que cada punto consta en la página de función que enlaza.
//
// La captura de Alumnas es REAL (panel nuevo, estudio de muestra de los e2e,
// scripts/capturas-home-v2.mjs); las demás son fragmentos dibujados con los
// textos del panel (piezas.tsx). El vídeo del producto, que antes iba bajo el
// héroe, vive ahora aquí, al final de la sección: «¿y si lo veo en marcha?».
// ─────────────────────────────────────────────────────────────────────────────

export interface PestanaProducto {
  id: string;
  etiqueta: string;
  titulo: string;
  puntos: readonly [string, string, string];
  enlace: { href: string; texto: string };
}

export const PESTANAS_PRODUCTO: readonly PestanaProducto[] = [
  {
    id: 'reservas',
    etiqueta: 'Reservas',
    titulo: 'Reservas a cualquier hora, sin contestar mensajes.',
    puntos: [
      'Tus alumnas reservan desde tu app o tu página de reservas, y pagan al reservar.',
      'Si la clase está llena, entran en lista de espera y la plaza se ofrece sola a la siguiente.',
      'Cada tipo de clase con sus reglas: antelación, plan obligatorio o aprobación manual.',
    ],
    enlace: { href: '/funcionalidades/reservas-online', texto: 'Ver las reservas online' },
  },
  {
    id: 'cobros',
    etiqueta: 'Cobros',
    titulo: 'Cuotas cobradas el día que toca.',
    puntos: [
      'Con la tarjeta guardada, las cuotas se renuevan y se cobran solas; por domiciliación, te prepara la remesa SEPA para tu banco.',
      'Si un cobro falla, se reintenta solo y a la alumna le llega un aviso.',
      'Bonos con caducidad, clase suelta, matrícula y códigos de descuento.',
    ],
    enlace: { href: '/funcionalidades/cobros-recurrentes', texto: 'Ver los cobros recurrentes' },
  },
  {
    id: 'alumnas',
    etiqueta: 'Alumnas',
    titulo: 'Cada alumna, con su historia a mano.',
    puntos: [
      'Su plan, lo que le queda y cuándo vino por última vez, en una sola fila.',
      'Avisos a la vista: quien viene menos o tiene un recibo sin cobrar.',
      'La ficha de salud con permisos aparte: el detalle lo ven la propietaria y, de sus alumnas, cada instructora; recepción y gerencia, solo el color del semáforo.',
    ],
    enlace: { href: '/funcionalidades/ficha-de-clienta', texto: 'Ver la ficha de cada alumna' },
  },
  {
    id: 'equipo',
    etiqueta: 'Equipo',
    titulo: 'Tu equipo, coordinado desde su móvil.',
    puntos: [
      'Cada instructora ve su agenda, pasa lista y marca su disponibilidad y sus ausencias en la app del estudio.',
      'La tarifa por hora de cada instructora, a la vista solo de quien debe verla.',
      'Liquidación mensual: horas impartidas por tarifa, listo para pasarlo a tu gestoría.',
    ],
    enlace: { href: '/funcionalidades/gestion-de-instructoras', texto: 'Ver la gestión de instructoras' },
  },
  {
    id: 'informes',
    etiqueta: 'Informes',
    titulo: 'Los números de tu estudio, claros.',
    puntos: [
      'Ingresos, clases y alumnas del mes, con su evolución.',
      'Lo que deja cada clase y cuánto se llena cada tipo.',
      'Qué alumnas llevan tiempo sin aparecer.',
    ],
    enlace: { href: '/funcionalidades/informes-y-rentabilidad', texto: 'Ver los informes' },
  },
];

const ESCENAS: Record<string, { descripcion: string; contenido: React.ReactNode }> = {
  reservas: {
    descripcion: 'Ejemplo del calendario de un día con una clase llena y su lista de espera, y de una reserva nueva hecha desde la app.',
    contenido: (<><AgendaDia className="wh-tab-ui" /><Ficha className="wh-tab-flota" etiqueta="Reserva nueva" estado="Confirmada" titulo="Reformer Fundamental · mar 09:00" nota="María reservó desde la app" /></>),
  },
  cobros: {
    descripcion: 'Ejemplo de Cobros con las próximas cuotas de cuatro alumnas y sus estados: se reintenta solo, cobrado, se cobra solo y sin cobrar.',
    contenido: <PanelCobros className="wh-tab-ui" completo />,
  },
  alumnas: {
    descripcion: 'Captura real del listado de clientas del panel con datos de muestra: filtros por estado y una fila por alumna con su plan, su saldo, su última clase y avisos como «Viene menos» o «Recibo sin cobrar».',
    contenido: (
      <picture className="wh-tab-captura">
        <source type="image/avif" srcSet="/producto/v2/panel-clientas-555.avif 555w, /producto/v2/panel-clientas-1110.avif 1110w" sizes="(max-width: 1000px) 92vw, 720px" />
        <img
          src="/producto/v2/panel-clientas-555.webp"
          srcSet="/producto/v2/panel-clientas-555.webp 555w, /producto/v2/panel-clientas-1110.webp 1110w"
          sizes="(max-width: 1000px) 92vw, 720px"
          width={1110}
          height={489}
          alt="Listado de clientas del panel de Tentare con datos de muestra: filtros por estado y una fila por alumna con su plan, su saldo, su última clase y avisos"
          // Sin `lazy`: va en una pestaña oculta (`hidden`) y el navegador no pide una
          // imagen perezosa que no se pinta, así que al abrir «Alumnas» salía en blanco
          // un instante (y e2e/landing-imagenes la daba por colgada). Pesa unos 10 KB.
          loading="eager"
          decoding="async"
        />
      </picture>
    ),
  },
  equipo: {
    descripcion: 'Ejemplo de pasar lista desde la app de la instructora: tres alumnas han venido y una está sin marcar.',
    contenido: <PasarLista className="wh-tab-ui" />,
  },
  informes: {
    descripcion: 'Ejemplo de los informes: evolución de ingresos de seis meses y ocupación por tipo de clase.',
    contenido: <PanelInformes className="wh-tab-ui" completo />,
  },
};

function Panel({ p }: { p: PestanaProducto }) {
  const e = ESCENAS[p.id];
  return (
    <div className="wh-tab-cuerpo">
      <div className="wh-tab-texto">
        <h3 className="wh-h3 wh-tab-h3">{p.titulo}</h3>
        <ul className="wh-puntos">
          {p.puntos.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <Link href={p.enlace.href} className="wh-enlace-flecha">{p.enlace.texto} <span aria-hidden="true">→</span></Link>
      </div>
      {p.id === 'alumnas'
        ? <figure className="wh-escena wh-tab-escena">{e.contenido}</figure>
        : <Escena className="wh-tab-escena" descripcion={e.descripcion}>{e.contenido}</Escena>}
    </div>
  );
}

export function PestanasProducto() {
  const pestanas: Pestana[] = PESTANAS_PRODUCTO.map((p) => ({ id: p.id, etiqueta: p.etiqueta, panel: <Panel p={p} /> }));
  return (
    <section id="funcionalidades" className="wh-seccion wh-tabs-seccion" aria-labelledby="wh-tabs-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera lp-rv">
          <h2 id="wh-tabs-h" className="wh-h2">Así se ve tu estudio por dentro.</h2>
          <p className="wh-lead">Elige un área y mira lo que Tentare hace en ella.</p>
        </div>
        <PestanasCliente pestanas={pestanas} etiqueta="Áreas de Tentare" />
        <div className="wh-video">
          <p className="wh-video-titulo">¿Prefieres verlo en marcha? Tentare por dentro, en 78 segundos.</p>
          <VideoProducto />
        </div>
      </div>
    </section>
  );
}
