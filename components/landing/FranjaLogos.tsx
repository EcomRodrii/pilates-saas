import { usaMarquesina, type LogoCliente } from '@/lib/landing/logos-clientes';

// «Estudios que ya usan Tentare» — la franja de logos de clientes (19-oct-2026,
// encargo del fundador tras mirar a Bsport, Momence y Mariana Tek: los tres tienen
// una tira de logos en gris justo debajo de la promesa). Aquí solo se copia la
// FORMA: una línea de título, logos a una tinta, todos a la misma altura y, con
// muchos, una marquesina suave.
//
// ⚠️ Qué estudios salen NO se decide aquí: llega ya filtrado de
// `lib/landing/logos-clientes-servidor.ts` (solo los que han dado su consentimiento,
// sin demos, con suscripción viva). Con cero logos esto no pinta NADA: ni título ni
// hueco. Sin logos no hay franja, que es mejor que una franja inventada.
//
// Desde la home nueva (fase 2.2) va JUSTO bajo el héroe y encima de las seis
// tarjetas, como en bsport y Momence (lo fija lib/landing/franja-logos-colocacion.test.ts).
//
// Cada logo ocupa una caja de tamaño FIJO (width/height en el <img> y en el CSS):
// el navegador no tiene que esperar a la imagen para saber cuánto ocupa, así que
// no hay desplazamiento de layout (CLS 0) aunque el logo de un estudio sea
// cuadrado y el de otro, una línea larga (`object-fit: contain`).
//
// Marquesina desde 7 logos: la pista lleva el grupo real (la lista que leen los
// lectores de pantalla) y copias decorativas (`aria-hidden`, `alt=""`) hasta
// cubrir de sobra una pantalla ancha. Con `prefers-reduced-motion`, sin movimiento:
// las copias se ocultan y los logos quedan en una fila que envuelve.
//
// Server Component: sin estado ni JavaScript en el cliente. Solo CSS.

const ANCHO = 140;
const ALTO = 40;
const HUECO = 48;
// Cuánto tiene que cubrir cada mitad de la pista para que no se vea el final en
// una pantalla ancha mientras corre.
const CUBRIR_PX = 2200;

function Logo({ logo, decorativo }: { logo: LogoCliente; decorativo: boolean }) {
  return (
    <li className="v7-logos-item">
      {/* eslint-disable-next-line @next/next/no-img-element -- logos de Supabase Storage de tamaño y forma libres: next/image no aporta nada aquí */}
      <img
        src={logo.logoUrl}
        alt={decorativo ? '' : logo.nombre}
        width={ANCHO}
        height={ALTO}
        // Sin `lazy`: en la marquesina las copias van fuera de la pantalla, de lado,
        // y el navegador no pedía una perezosa que no cruza la vista (llegaban en
        // blanco al entrar). Son las mismas URL que los reales: no se descarga nada más.
        loading="eager"
        decoding="async"
      />
    </li>
  );
}

export function FranjaLogos({ logos }: { logos: readonly LogoCliente[] }) {
  if (logos.length === 0) return null;
  const marquesina = usaMarquesina(logos.length);
  // Copias decorativas: 2k grupos en total (1 real + 2k-1 decorativos), k mitades.
  const k = Math.max(1, Math.ceil(CUBRIR_PX / (logos.length * (ANCHO + HUECO))));
  const copias = marquesina ? 2 * k - 1 : 0;

  return (
    // Sin frase encima (fundador, 20-oct-2026: «quita la frase»), como la franja de Mariana Tek;
    // el nombre de la sección queda para los lectores de pantalla.
    <section id="clientes" className="v7-logos" aria-label="Estudios que usan Tentare">

      <div className={marquesina ? 'v7-logos-carril v7-logos-marq' : 'v7-logos-carril'}>
        <div className="v7-logos-pista" style={{ ['--n' as string]: logos.length * (2 * k) }}>
          <ul className="v7-logos-lista">
            {logos.map((l) => <Logo key={l.logoUrl} logo={l} decorativo={false} />)}
          </ul>
          {Array.from({ length: copias }, (_, i) => (
            <ul key={i} className="v7-logos-lista v7-logos-copia" aria-hidden="true">
              {logos.map((l) => <Logo key={l.logoUrl} logo={l} decorativo />)}
            </ul>
          ))}
        </div>
      </div>

      <style>{`
        .v7-logos { padding: clamp(36px,4.5vw,56px) clamp(20px,4vw,48px) clamp(4px,1vw,12px); }
        .v7-logos-t { margin: 0 0 clamp(16px,2vw,24px); text-align: center; font-size: 14px; font-weight: 700; line-height: 1.4;
          letter-spacing: .01em; color: #5A5A52; }

        .v7-logos-carril { max-width: 1240px; margin: 0 auto; overflow: hidden; }
        .v7-logos-pista { display: flex; width: max-content; max-width: 100%; margin: 0 auto; }
        .v7-logos-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center;
          align-items: center; gap: 20px ${HUECO}px; }
        .v7-logos-item { flex: none; width: ${ANCHO}px; height: ${ALTO}px; display: flex; align-items: center; justify-content: center; }
        /* Una sola tinta: una fila de colores ajenos le quita el protagonismo a la marca
           propia. El color vuelve al pasar el ratón. */
        .v7-logos-item img { display: block; width: ${ANCHO}px; height: ${ALTO}px; object-fit: contain; object-position: center;
          filter: grayscale(1); opacity: .7; transition: filter var(--motion-normal) var(--motion-ease), opacity var(--motion-normal) var(--motion-ease); }
        .v7-logos-item:hover img { filter: none; opacity: 1; }

        /* Marquesina: una sola línea, sin envolver, con los bordes que se funden. */
        .v7-logos-marq { -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
        .v7-logos-marq .v7-logos-pista { max-width: none; margin: 0; animation: v7-logos-corre calc(var(--n) * 2s) linear infinite; }
        .v7-logos-marq .v7-logos-lista { flex-wrap: nowrap; flex: none; justify-content: flex-start; padding-right: ${HUECO}px; }
        .v7-logos-marq:hover .v7-logos-pista { animation-play-state: paused; }
        @keyframes v7-logos-corre { to { transform: translate3d(-50%, 0, 0); } }

        @media (max-width: 560px) {
          .v7-logos-lista { gap: 14px 18px; }
          .v7-logos-marq .v7-logos-lista { padding-right: 18px; }
          .v7-logos-item, .v7-logos-item img { width: 96px; height: 30px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .v7-logos-marq { -webkit-mask-image: none; mask-image: none; }
          .v7-logos-marq .v7-logos-pista { animation: none; width: auto; max-width: 100%; margin: 0 auto; }
          .v7-logos-marq .v7-logos-lista { flex: 0 1 auto; flex-wrap: wrap; justify-content: center; padding-right: 0; }
          .v7-logos-copia { display: none; }
          .v7-logos-item img { transition: none; }
        }
      `}</style>
    </section>
  );
}
