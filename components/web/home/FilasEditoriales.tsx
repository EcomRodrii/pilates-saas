import Link from 'next/link';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';
import { MarcoIphone } from '@/components/ui/marco-iphone';
import { Aviso, CAPTURAS_APP, Escena, MapaSala, PasarLista } from './piezas';

// ─────────────────────────────────────────────────────────────────────────────
// Filas alternas texto ↔ imagen (fase 2.2): la composición de Mariana Tek (una
// idea por fila, aire generoso) con el detalle de Momence: icono de 32 px en el
// color de acento sobre el titular, y el fragmento de UI sobre un panel blanco
// ligeramente inclinado en perspectiva, con una sombra suave y larga.
//
// Los ids son anclas vivas: `#app` lo usa el menú de la isla («App para
// alumnas») y los tres son la `ubicacion` de PostHog de su franja.
//
// Cada afirmación, contra el código (lista en el PR): la app es una PWA con la
// marca del estudio que se añade a la pantalla de inicio (FAQ de la home);
// avisos de bono del catálogo de notificaciones; la instructora trabaja en la
// app del estudio (agenda, pasar lista, disponibilidad, ausencias, «no puedo
// asistir»); el mapa para elegir reformer es opcional por tipo de clase.
// ─────────────────────────────────────────────────────────────────────────────

interface Fila {
  id: string;
  icono: NombreIcono;
  titulo: string;
  texto: string;
  enlaces: readonly { href: string; texto: string }[];
  descripcion: string;
  escena: React.ReactNode;
}

const FILAS: readonly Fila[] = [
  {
    id: 'app',
    icono: 'inicio',
    titulo: 'Tu app, en el móvil de cada alumna.',
    texto: 'Con el nombre, el logo y los colores de tu estudio. La añaden a la pantalla de inicio desde el navegador y desde ahí reservan, cancelan, pagan sus recibos y ven cuántas clases les quedan. Si prefieren no instalar nada, reservan desde tu página.',
    enlaces: [{ href: '/funcionalidades/app-para-alumnas', texto: 'La app de tus alumnas' }],
    descripcion: 'La app de una alumna con la marca de su estudio: su próxima clase, su progreso de la semana, y el aviso de que su bono está por caducar.',
    escena: (
      <>
        {/* La app NUEVA en el mismo iPhone 17 Pro del héroe. La pantalla de recibos que había
            salió el 20-oct: era del diseño anterior de la app. Hasta tener una captura nueva de
            otra pantalla (Mi plan, Reservar), repite la de Inicio: mejor eso que enseñar la vieja. */}
        <MarcoIphone className="wh-fila-tel" modelo="17-pro" escala={0.52} tinta="clara" indicador="oscura">
          <div className="wh-fila-pantalla"><picture>
            <source type="image/avif" srcSet={`/landing/capturas/${CAPTURAS_APP.inicio.n}-390.avif 390w, /landing/capturas/${CAPTURAS_APP.inicio.n}-780.avif 780w`} sizes="220px" />
            <img
              src={`/landing/capturas/${CAPTURAS_APP.inicio.n}-390.webp`}
              srcSet={`/landing/capturas/${CAPTURAS_APP.inicio.n}-390.webp 390w, /landing/capturas/${CAPTURAS_APP.inicio.n}-780.webp 780w`}
              sizes="220px"
              width={780}
              height={1696}
              alt={CAPTURAS_APP.inicio.alt}
              loading="lazy"
              decoding="async"
            />
          </picture></div>
        </MarcoIphone>
        <Aviso className="wh-fila-flota" titulo="Tu bono está por caducar" texto="Te quedan 2 sesiones y tu bono caduca el 28 oct. Renueva para no perderlas." />
      </>
    ),
  },
  {
    id: 'equipo',
    icono: 'instructoras',
    titulo: 'Tu equipo, en la misma app.',
    texto: 'Cada instructora ve su agenda, pasa lista con el QR de la alumna, marca su disponibilidad y avisa si no puede dar una clase. Tú lo ves todo desde el panel, sin grupos de WhatsApp.',
    enlaces: [{ href: '/funcionalidades/gestion-de-instructoras', texto: 'Gestión de instructoras' }, { href: '/funcionalidades/control-de-asistencia', texto: 'Control de asistencia' }],
    descripcion: 'Ejemplo de pasar lista de la clase de las 19:00 desde la app de la instructora: tres alumnas han venido y una está sin marcar.',
    escena: <PasarLista className="wh-fila-ui" />,
  },
  {
    id: 'pilates-y-yoga',
    icono: 'plaza',
    titulo: 'Reformer, suelo o yoga: tú decides.',
    texto: 'Cada tipo de clase con su antelación y su lista de espera, y cada sala con su aforo. En reformer, la alumna puede elegir su máquina en el mapa de la sala; en una sala de yoga, reserva su plaza y listo.',
    enlaces: [{ href: '/soluciones/estudio-de-pilates-reformer', texto: 'Para estudios de Pilates reformer' }, { href: '/soluciones/estudio-de-yoga', texto: 'Para estudios de yoga' }],
    descripcion: 'Ejemplo del mapa de la sala en la app de la alumna para elegir reformer: el suyo marcado, los ocupados y los libres.',
    escena: <MapaSala className="wh-fila-ui" />,
  },
];

export function FilasEditoriales() {
  return (
    <section className="wh-seccion wh-filas-seccion" aria-labelledby="wh-filas-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera lp-rv">
          <h2 id="wh-filas-h" className="wh-h2">Pensado para cómo funciona un estudio.</h2>
        </div>
        {FILAS.map((f, i) => (
          <article key={f.id} id={f.id} className={i % 2 ? 'wh-fila-ed wh-fila-ed-inversa' : 'wh-fila-ed'} aria-labelledby={`wh-fila-${f.id}`}>
            <div className="wh-fila-ed-texto">
              <span className="wh-fila-ed-icono"><Icono nombre={f.icono} tamano={32} grosor={1.4} /></span>
              <h3 id={`wh-fila-${f.id}`} className="wh-h3 wh-fila-ed-h3">{f.titulo}</h3>
              <p className="wh-texto">{f.texto}</p>
              <p className="wh-fila-ed-enlaces">
                {f.enlaces.map((e) => <Link key={e.href} href={e.href} className="wh-enlace-flecha">{e.texto} <span aria-hidden="true">→</span></Link>)}
              </p>
            </div>
            <div className="wh-fila-ed-visual lp-rv">
              <div className="wh-inclinado">
                <Escena descripcion={f.descripcion}>{f.escena}</Escena>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
