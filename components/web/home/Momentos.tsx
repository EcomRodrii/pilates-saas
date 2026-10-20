import { FOTOS, FOTOS_APORTADAS, rutaFoto } from '@/components/landing/fotos';

// ─────────────────────────────────────────────────────────────────────────────
// «Un día cualquiera en tu estudio» (home v2, 20-oct-2026). La banda de fotos de
// Mariana Tek («Communicate · Motivate · Elevate · Celebrate»): personas de verdad a
// sangre, un verbo y una frase. Sustituye a la tirada de tarjetas de interfaz que se
// repetía cinco veces: aquí el producto no se dibuja, se ve lo que provoca.
//
// Solo fotos del registro (components/landing/fotos.ts y las aportadas por el
// fundador), con su texto alternativo. Cada frase, contra el producto:
//  · las reservas desde la app del estudio, a cualquier hora (reservas online);
//  · la clase fija se reserva sola cada semana, con cuota (`plazas_fijas`);
//  · la sustitución espera el visto bueno: es el modo por defecto (asistido);
//  · las cuotas se cobran solas y, si una falla, se reintenta (dunning).
// Server Component: ni un byte de JavaScript.
// ─────────────────────────────────────────────────────────────────────────────

interface Momento {
  verbo: string;
  texto: string;
  src: string;
  srcAvif: string;
  alt: string;
  ancho: number;
  alto: number;
  posicion: string;
}

const MOMENTOS: readonly Momento[] = [
  {
    verbo: 'Reserva.',
    texto: 'A las siete de la mañana, desde la app de tu estudio. Sin escribirte.',
    src: `/landing/fotos-aportadas/${FOTOS_APORTADAS.app.base}-864.webp`,
    srcAvif: `/landing/fotos-aportadas/${FOTOS_APORTADAS.app.base}-864.avif`,
    alt: 'Alumna sonriendo con el móvil en la mano y una esterilla de yoga',
    ancho: 864,
    alto: 1080,
    posicion: '50% 22%',
  },
  {
    verbo: 'Repite.',
    texto: 'Su clase fija de los martes se reserva sola cada semana.',
    // La aportada y no FOTOS.selfie: esa ya va en la tarjeta «Voy a abrir mi estudio».
    src: `/landing/fotos-aportadas/${FOTOS_APORTADAS.reservas.base}.webp`,
    srcAvif: `/landing/fotos-aportadas/${FOTOS_APORTADAS.reservas.base}.avif`,
    alt: 'Alumna haciéndose una foto en el espejo de un estudio de Pilates con reformers',
    ancho: FOTOS_APORTADAS.reservas.ancho,
    alto: FOTOS_APORTADAS.reservas.alto,
    posicion: '50% 35%',
  },
  {
    verbo: 'Cubre.',
    texto: 'Si una instructora no puede, Tentare propone quién la sustituye y espera tu sí.',
    src: `/landing/fotos-aportadas/${FOTOS_APORTADAS.equipo.base}.webp`,
    srcAvif: `/landing/fotos-aportadas/${FOTOS_APORTADAS.equipo.base}.avif`,
    alt: 'Una instructora y una alumna charlando sobre sus reformers en un estudio de Pilates',
    ancho: FOTOS_APORTADAS.equipo.ancho,
    alto: FOTOS_APORTADAS.equipo.alto,
    posicion: '50% 40%',
  },
  {
    verbo: 'Cobra.',
    texto: 'Con el estudio cerrado, las cuotas se cobran solas. Si una falla, se reintenta.',
    src: rutaFoto(FOTOS.anoche, 'movil', 828, 'webp'),
    srcAvif: rutaFoto(FOTOS.anoche, 'movil', 828, 'avif'),
    alt: FOTOS.anoche.alt,
    ancho: 828,
    alto: 1035,
    posicion: '60% 50%',
  },
];

export function Momentos() {
  return (
    <section id="momentos" className="wh-seccion wh-oscura wh-mom" aria-labelledby="wh-mom-h">
      <div className="wh-contenedor">
        <div className="wh-cabecera wh-cabecera-centro lp-rv">
          <h2 id="wh-mom-h" className="wh-h2">Un día cualquiera en tu estudio.</h2>
          <p className="wh-lead">Lo que pasa mientras das clase, sin que tengas que estar pendiente.</p>
        </div>
        <ul className="wh-mom-rejilla">
          {MOMENTOS.map((m) => (
            <li key={m.verbo} className="wh-mom-tarjeta lp-rv">
              <picture>
                <source type="image/avif" srcSet={m.srcAvif} />
                <img src={m.src} alt={m.alt} width={m.ancho} height={m.alto} loading="lazy" decoding="async" style={{ objectPosition: m.posicion }} />
              </picture>
              <div className="wh-mom-texto">
                <p className="wh-mom-verbo">{m.verbo}</p>
                <p className="wh-mom-frase">{m.texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
