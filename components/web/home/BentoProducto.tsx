import Link from 'next/link';
import { SE_LLEVA } from '@/lib/landing/migracion';
import { BotonBloque } from '@/components/landing/BotonBloque';
import { FOTOS_APORTADAS } from '@/components/landing/fotos';
import { ActaImportacion, Aviso, Escena, FotoAportada, FotogramaEspera, FotogramaReintento, MargenPorClase, Pastilla } from './piezas';

// ─────────────────────────────────────────────────────────────────────────────
// El producto dibujado (fase 2.2): el bento de bsport. Seis tarjetas de radio
// 24, sin sombra, en dos o tres casi blancos y una oscura; cada una con un
// titular de RESULTADO, una frase, sus chips y el fragmento del producto que SALE
// por el borde de la tarjeta (recortado por ella, como si siguiera fuera), con
// una o dos piezas encima con sombra suave. Tres niveles de capa y ni uno más:
// tarjeta plana → pieza blanca con sombra → pastilla sin sombra. Una de cada
// tres tarjetas lleva FOTO grande con una mini-tarjeta encima (el ritmo de
// bsport), y «cómo funciona» es un fotograma de antes y después dentro de la
// propia pieza (clase llena → en espera → plaza ofrecida), no una lista de pasos.
//
// Ninguna de estas piezas se repite en el héroe, las pestañas ni las filas: las
// viñetas repetidas entre secciones son el fallo de Momence.
//
// Lo que bsport no hace y aquí sí: cada titular es un enlace a SU página y cada
// chip lleva a la función que nombra (lo vigila lib/landing/enlaces-bento.test.ts).
//
// Server Component: ni un byte de esto entra en el JavaScript de la home.
// ─────────────────────────────────────────────────────────────────────────────

type Chip = readonly [texto: string, ruta: string];

interface Tarjeta {
  id: string;
  href: string;
  titulo: string;
  texto: string;
  chips: readonly Chip[];
  /** Tamaño en la rejilla de 12 columnas y tono de fondo. */
  clase: string;
  descripcion: string;
  escena: React.ReactNode;
}

const TARJETAS: readonly Tarjeta[] = [
  {
    id: 'wh-bn-reservas',
    href: '/funcionalidades/reservas-online',
    titulo: 'Llena tus clases con la lista de espera.',
    texto: 'Tus alumnas reservan desde tu app o tu web y, cuando alguien cancela, la plaza se ofrece sola a la siguiente de la lista.',
    chips: [['Reservas online', '/funcionalidades/reservas-online'], ['Lista de espera', '/funcionalidades/lista-de-espera'], ['Clases fijas', '/funcionalidades/plazas-fijas']],
    clase: 'wh-bn-7 wh-bn-crema wh-bn-con-aviso',
    descripcion: 'Ejemplo: la clase de las 19:00 está llena con tres alumnas en espera; una cancela desde su app, la plaza se ofrece a la primera de la lista y su reserva queda confirmada.',
    escena: (
      <>
        <FotogramaEspera className="wh-bn-ui wh-bn-ui-abajo" />
        <Aviso className="wh-bn-flota wh-bn-flota-arriba" titulo="¡Se ha liberado tu plaza!" texto="Ha quedado sitio en Reformer Avanzado del martes y ya tienes plaza confirmada." />
      </>
    ),
  },
  {
    id: 'wh-bn-cobros',
    href: '/funcionalidades/cobros-recurrentes',
    titulo: 'Cobra sin perseguir a nadie.',
    texto: 'Cuotas y bonos con la tarjeta guardada o por SEPA. Si un cobro falla, se reintenta solo.',
    chips: [['Cobros recurrentes', '/funcionalidades/cobros-recurrentes'], ['Bonos y membresías', '/funcionalidades/bonos-y-membresias'], ['Facturación', '/funcionalidades/facturacion']],
    clase: 'wh-bn-5 wh-bn-oscura wh-bn-con-aviso',
    descripcion: 'Ejemplo: la cuota de una alumna no se puede cobrar a la primera, le llega el aviso, se reintenta sola y queda cobrada con su tarjeta guardada. Se reintenta a los 3 y a los 7 días, tres intentos en total.',
    escena: (
      <>
        <FotogramaReintento className="wh-bn-ui wh-bn-ui-abajo" />
        {/* Los plazos son los del dunning real (lib/guia/curriculo.ts): 3 y 7 días, tres intentos. */}
        <div className="wh-ficha wh-bn-flota wh-bn-flota-arriba">
          <span className="wh-ficha-fila"><span className="wh-ficha-etiqueta">Próximo reintento</span><Pastilla tono="aviso">Programado</Pastilla></span>
          <span className="wh-ficha-titulo">A los 3 días</span>
          <span className="wh-ficha-nota">Y otro a los 7. Tú no haces nada.</span>
        </div>
      </>
    ),
  },
  {
    id: 'wh-bn-app',
    href: '/funcionalidades/app-para-alumnas',
    titulo: 'Tu app, con tu nombre y tu logo.',
    texto: 'Tus alumnas la añaden a la pantalla de inicio del móvil y desde ahí reservan, pagan y ven su bono.',
    chips: [['App para alumnas', '/funcionalidades/app-para-alumnas'], ['Control de asistencia', '/funcionalidades/control-de-asistencia'], ['Avisos', '/funcionalidades/automatizaciones-y-avisos']],
    clase: 'wh-bn-5 wh-bn-foto',
    descripcion: 'Una alumna con el móvil y su esterilla de yoga, y el aviso de su próxima clase.',
    escena: (
      <>
        <FotoAportada
          className="wh-bn-foto-img"
          src={`${FOTOS_APORTADAS.app.base}-864`}
          ancho={FOTOS_APORTADAS.app.ancho}
          alto={FOTOS_APORTADAS.app.alto}
          alt="Alumna sonriendo con el móvil en la mano y una esterilla de yoga"
          sizes="(max-width: 760px) 92vw, 500px"
          posicion="50% 22%"
        />
        <Aviso className="wh-bn-flota wh-bn-flota-abajo" titulo="Tu clase es en 2 horas" texto="Yoga Flow a las 18:00. ¡Nos vemos en un rato!" />
      </>
    ),
  },
  {
    id: 'wh-bn-equipo',
    href: '/funcionalidades/sustituciones',
    titulo: 'Una baja, cubierta con un solo sí.',
    texto: 'Tentare propone quién puede dar la clase según su disponibilidad y su costumbre, y le escribe por orden en cuanto das el visto bueno.',
    chips: [['Sustituciones', '/funcionalidades/sustituciones'], ['Gestión de instructoras', '/funcionalidades/gestion-de-instructoras'], ['Calendario y salas', '/funcionalidades/calendario-y-salas']],
    clase: 'wh-bn-7 wh-bn-foto wh-bn-foto-ancha',
    descripcion: 'Una instructora y una alumna en un estudio de Pilates, y la sustitución de la clase de las 19:00 ya cubierta.',
    escena: (
      <>
        <FotoAportada
          className="wh-bn-foto-img"
          src={FOTOS_APORTADAS.equipo.base}
          ancho={FOTOS_APORTADAS.equipo.ancho}
          alto={FOTOS_APORTADAS.equipo.alto}
          alt="Una instructora y una alumna charlando sobre sus reformers en un estudio de Pilates"
          sizes="(max-width: 760px) 92vw, 434px"
          posicion="50% 40%"
        />
        <div className="wh-ficha wh-bn-flota wh-bn-flota-abajo">
          <span className="wh-ficha-fila"><span className="wh-ficha-etiqueta">Reformer Avanzado · 19:00</span><Pastilla tono="ok">Cubierta</Pastilla></span>
          <span className="wh-ficha-titulo">La da Ana Ferrer</span>
          <span className="wh-ficha-nota">Marta avisó de la baja; tú diste el visto bueno</span>
        </div>
      </>
    ),
  },
  {
    id: 'wh-bn-informes',
    href: '/funcionalidades/informes-y-rentabilidad',
    titulo: 'Sabes qué clase te da dinero.',
    texto: 'Lo que deja cada clase, cuánto se llena cada tipo y tus ingresos del mes, sin montar una hoja de cálculo.',
    chips: [['Informes y rentabilidad', '/funcionalidades/informes-y-rentabilidad'], ['Ficha de clienta', '/funcionalidades/ficha-de-clienta'], ['Bonos y membresías', '/funcionalidades/bonos-y-membresias']],
    clase: 'wh-bn-6 wh-bn-papel',
    descripcion: 'Ejemplo de lo que deja cada clase del horario, de más a menos, en barras.',
    escena: <MargenPorClase className="wh-bn-ui wh-bn-ui-abajo" />,
  },
  {
    id: 'wh-bn-cambiar',
    href: '/soluciones/cambiar-de-software',
    titulo: 'Cámbiate sin empezar de cero.',
    texto: 'Subes lo que exporta tu programa actual, revisas el acta y confirmas. Si algo no cuadra, lo deshaces.',
    chips: [['Cambiar de software', '/soluciones/cambiar-de-software'], ['Clases recurrentes', '/funcionalidades/clases-recurrentes'], ['Ficha de clienta', '/funcionalidades/ficha-de-clienta']],
    clase: 'wh-bn-6 wh-bn-arena',
    descripcion: 'Ejemplo del acta del importador con lo que se trae: clientas, bonos y membresías, clases y horario, reservas, citas y pagos históricos, y los botones de confirmar y deshacer.',
    escena: <ActaImportacion filas={SE_LLEVA} className="wh-bn-ui wh-bn-ui-abajo" />,
  },
];

export function BentoProducto() {
  return (
    <section id="plataforma" className="wh-seccion wh-bn" aria-labelledby="wh-bn-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera wh-cabecera-centro lp-rv">
          <h2 id="wh-bn-h" className="wh-h2">Reservas, cobros, app y equipo, en un solo panel.</h2>
          <p className="wh-lead">Hecho para estudios de Pilates y yoga: lo que pasa en tu sala, tu recepción y el móvil de tus alumnas.</p>
        </div>
        <div className="wh-bn-rejilla">
          {TARJETAS.map((t) => (
            <article key={t.id} className={`wh-bn-tarjeta lp-rv ${t.clase}`} aria-labelledby={t.id}>
              <div className="wh-bn-texto">
                <h3 id={t.id} className="wh-h3 wh-bn-h3"><Link href={t.href}>{t.titulo}</Link></h3>
                <p className="wh-texto">{t.texto}</p>
                <ul className="wh-chips">
                  {t.chips.map(([texto, ruta]) => <li key={texto} className="wh-chip-enlace"><Link href={ruta}>{texto}</Link></li>)}
                </ul>
              </div>
              <Escena className="wh-bn-escena" descripcion={t.descripcion}>{t.escena}</Escena>
            </article>
          ))}
        </div>
        <div className="wh-bn-pie">
          <Link href="/funcionalidades" className="wh-enlace-flecha">Ver todas las funcionalidades <span aria-hidden="true">→</span></Link>
          <BotonBloque />
        </div>
      </div>
    </section>
  );
}
