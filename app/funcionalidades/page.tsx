import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, CircleDollarSign, CircleHelp, Compass, LayoutGrid, Smartphone, Users } from 'lucide-react';
import { PageBreadcrumb } from '@/components/recursos/ArticleStructuredData';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { AreaHub, CierreHub, Etiqueta, FaqHub, HeroHub, HubShell, type FilaFuncion } from '@/components/web/hub/Hub';
import { EscenaCobros, EscenaEquipo, EscenaInformes, EscenaAlumnas, EscenaReservas } from '@/components/web/hub/fragmentos';
import { GRATIS_CON_LIMITES } from '@/lib/landing/founding-gratis';
import { funcionalidades, paginaDe, urlDe } from '@/lib/seo/paginas';
import { FAQ_FUNCIONALIDADES } from '@/lib/seo/faq-hubs';

const PATH = '/funcionalidades';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { siteName: 'Tentare', type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH), images: [{ url: '/funcionalidades/opengraph-image' }] },
};

// «Producto» en el menú. Rediseñada el 16-nov-2026 al idioma de la home nueva (ver components/web/hub/Hub.tsx): cada área enseña el
// MOMENTO del producto que demuestra su promesa (components/web/hub/fragmentos.tsx, datos de muestra) y sus funciones como filas con lo
// que hacen. Las frases de cada función salen del registro (`resumen`), la misma fuente que el menú, el pie y el sitemap.
//
// Agrupación editorial: los `path` salen del registro, así que una página nueva no puede quedarse fuera sin que el test de cobertura lo
// cante, pero SÍ hay que meterla en uno de estos bloques a mano (dónde encaja conceptualmente no se puede automatizar). Si alguna no
// estuviera en ningún bloque, se pinta igualmente al final en vez de desaparecer del hub sin avisar.
//
// ⚠️ Los textos de cada área solo dicen lo que ya consta en las páginas de función (reglas por tipo de clase, plazo para aceptar la plaza,
// reintentos, factura por cobro salvo efectivo, ficha de salud solo para quien debe verla, margen por clase…). Los fragmentos son de
// muestra y nada de esto promete la sustitución «sola»: en el modo de serie espera tu visto bueno.
interface Bloque {
  id: string;
  icono: React.ReactNode;
  etiqueta: string;
  titulo: string;
  texto: string;
  paths: string[];
  escena: React.ReactNode;
}

const BLOQUES: Bloque[] = [
  {
    id: 'reservas',
    icono: <CalendarDays size={15} strokeWidth={1.6} />,
    etiqueta: 'Reservas y horario',
    titulo: 'Que las clases se llenen.',
    texto: 'Tus alumnas reservan solas desde el móvil y tú pones las reglas, clase por clase: antelación, cancelación, lista de espera y plazas fijas.',
    paths: ['/funcionalidades/reservas-online', '/funcionalidades/lista-de-espera', '/funcionalidades/plazas-fijas', '/funcionalidades/calendario-y-salas', '/funcionalidades/clases-recurrentes', '/funcionalidades/cancelaciones-y-politicas', '/funcionalidades/control-de-asistencia'],
    escena: <EscenaReservas />,
  },
  {
    id: 'equipo',
    icono: <Users size={15} strokeWidth={1.6} />,
    etiqueta: 'Equipo',
    titulo: 'Que el equipo funcione sin ti.',
    texto: 'Quién puede dar qué, cuánto cuesta cada hora y qué pasa el día que una instructora no puede dar su clase.',
    paths: ['/funcionalidades/gestion-de-instructoras', '/funcionalidades/sustituciones'],
    escena: <EscenaEquipo />,
  },
  {
    id: 'dinero',
    icono: <CircleDollarSign size={15} strokeWidth={1.6} />,
    etiqueta: 'Cobros y facturas',
    titulo: 'Que el dinero entre y cuadre.',
    texto: 'Bonos, cuotas y cobros con tarjeta o remesa SEPA, y una factura numerada por cada cobro que llega a tu gestoría sin que la emitas a mano.',
    paths: ['/funcionalidades/bonos-y-membresias', '/funcionalidades/cobros-recurrentes', '/funcionalidades/facturacion'],
    escena: <EscenaCobros />,
  },
  {
    id: 'alumnas',
    icono: <Smartphone size={15} strokeWidth={1.6} />,
    etiqueta: 'Alumnas y app',
    titulo: 'Que nadie se te escape.',
    texto: 'Cada alumna con su historial, su ficha de salud y su app con tu nombre; y avisos que salen solos cuando algo pide atención.',
    paths: ['/funcionalidades/ficha-de-clienta', '/funcionalidades/app-para-alumnas', '/funcionalidades/automatizaciones-y-avisos'],
    escena: <EscenaAlumnas />,
  },
  {
    id: 'decisiones',
    icono: <LayoutGrid size={15} strokeWidth={1.6} />,
    etiqueta: 'Informes y sedes',
    titulo: 'Que las decisiones no sean a ojo.',
    texto: 'Ingresos, ocupación y margen de cada clase para decidir qué franja mover y qué precio tocar, y varias sedes con un solo acceso.',
    paths: ['/funcionalidades/informes-y-rentabilidad', '/funcionalidades/multi-centro'],
    escena: <EscenaInformes />,
  },
];

const INDICE = [...BLOQUES.map(b => ({ href: `#${b.id}`, texto: b.etiqueta })), { href: '#preguntas', texto: 'Preguntas' }];

const enBloques = new Set(BLOQUES.flatMap(b => b.paths));
const SUELTAS = funcionalidades().filter(f => !enBloques.has(f.path));

function filasDe(paths: string[]): FilaFuncion[] {
  return paths.flatMap(p => {
    const f = paginaDe(p);
    return f ? [{ href: p, nombre: f.etiqueta, resumen: f.resumen ?? f.descripcion }] : [];
  });
}

// El número de funciones sale del registro: escrito a mano decía «diez» y se quedó desfasado en cuanto entraron dos páginas más.
export default function FuncionalidadesPage() {
  return (
    <HubShell fija="producto">
      <OrganizationStructuredData />
      <PageBreadcrumb path={PATH} name="Funcionalidades" />

      <HeroHub
        etiqueta={<Etiqueta icono={<Compass size={16} strokeWidth={1.6} />}>Producto</Etiqueta>}
        categoria="Funcionalidades del software para estudios de Pilates"
        titulo={<>Todo lo que hace Tentare, sin adjetivos.</>}
        texto={<>{funcionalidades().length} funciones en cinco áreas, explicadas por lo que resuelven en un estudio de Pilates de verdad, con sus reglas, sus umbrales y también sus límites.</>}
        indice={INDICE}
      />

      <div className="hx-areas">
        {BLOQUES.map((b, i) => (
          <AreaHub key={b.id} id={b.id} icono={b.icono} etiqueta={b.etiqueta} titulo={b.titulo} texto={b.texto} filas={filasDe(b.paths)} escena={b.escena} inversa={i % 2 === 1} />
        ))}
        {SUELTAS.length > 0 && (
          <AreaHub id="mas" icono={<LayoutGrid size={15} strokeWidth={1.6} />} etiqueta="Más funciones" titulo="Y también esto." texto="Lo que no encaja en ninguna de las áreas de arriba." filas={filasDe(SUELTAS.map(f => f.path))} escena={<EscenaReservas />} />
        )}
      </div>

      {/* Lo que Tentare todavía no hace, dicho en el propio índice (la comparativa lo detalla). El texto es el que ya estaba publicado. */}
      <section className="hx-limites" aria-labelledby="hx-limites-t">
        <div className="hx-limites-in">
          <div>
            <Etiqueta icono={<CircleHelp size={15} strokeWidth={1.6} />}>Con franqueza</Etiqueta>
            <h2 id="hx-limites-t">Y lo que todavía no hacemos</h2>
            <p>
              No hay app nativa en las tiendas —tus alumnas usan un portal web instalable—, ni herramienta de campañas de email marketing, ni
              pantalla de kiosko para fichar en tablet. Está en la <Link href="/comparativa">comparativa</Link>, sin rodeos.
            </p>
          </div>
          <ul className="hx-limites-chips" aria-label="Lo que todavía no hay">
            <li>App nativa en las tiendas</li>
            <li>Campañas de email marketing</li>
            <li>Kiosko para fichar en tablet</li>
          </ul>
        </div>
      </section>

      <FaqHub
        id="preguntas"
        icono={<CircleHelp size={15} strokeWidth={1.6} />}
        etiqueta="Preguntas"
        titulo="Lo que se pregunta antes de empezar."
        texto="Si no sabes en qué área mirar, empieza por aquí."
        items={FAQ_FUNCIONALIDADES}
      />

      <CierreHub titulo="Pruébalo con tu estudio de verdad." texto={`${GRATIS_CON_LIMITES}, sin tarjeta y sin permanencia.`} />
    </HubShell>
  );
}
