import type { CSSProperties } from 'react';

// Ilustraciones de los estados vacíos.
//
// ⚠️ Van DIBUJADAS AQUÍ, con los tokens del tema, y no traídas de un banco de
// ilustraciones. Dos motivos, y el segundo pesa más:
//
//  1. Las gratuitas de Storyset/Icons8 exigen atribución visible («you must
//     always include the attribution»), y esto es marca blanca: el crédito
//     saldría en la app de los trece estudios, que pagan por que ponga SU
//     nombre y no el de un tercero.
//  2. Vienen con su propia paleta. Este portal se tiñe con la marca de cada
//     estudio —índigo, violeta, tostado— y una ilustración de color fijo es la
//     misma trampa que la barra del bono en verde (#1832) o el ✓ de acento
//     sobre un muro (#1827): un color que no es de nadie, encima de todo.
//
// Aquí el sujeto se pinta con `--accent` y sus derivados, así que cada estudio
// las ve en su color sin tocar una línea.
//
// **Que se parezcan es una decisión, no una casualidad**: todas comparten
// lienzo (160×120), la misma mancha de fondo, la misma sombra de apoyo y el
// mismo grosor de trazo. Lo único que cambia es el sujeto. Sin esa base, doce
// dibujos sueltos parecen doce sitios distintos de la app.

export type NombreIlustracion =
  | 'postura' | 'calendario' | 'busqueda' | 'bono' | 'tienda'
  | 'campana' | 'tarjeta' | 'trofeo' | 'charla' | 'recibo';

const TRAZO = 3.2;

/** La mancha de acento y la sombra de apoyo que llevan todas. */
function Escena({ children }: { children: React.ReactNode }) {
  return (
    <>
      <circle cx="80" cy="52" r="40" fill="var(--accent-soft)" />
      <ellipse cx="80" cy="102" rx="38" ry="5" fill="var(--accent)" opacity=".14" />
      {children}
    </>
  );
}

/** Trazo del sujeto: siempre el mismo grosor y remates redondos. */
const trazo = {
  fill: 'none' as const,
  stroke: 'var(--accent)',
  strokeWidth: TRAZO,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// ⚠️ Todos los sujetos caben en el MISMO marco (x 46–114, y 26–96) y cruzan la
// mancha por arriba y por abajo la misma cantidad. Es lo que hace que diez
// dibujos distintos se lean como un set: sin ese encuadre común, cada uno se
// apoyaba donde le pillaba y parecían recortados de sitios diferentes.
//
// Y el color son TRES tonos, siempre los mismos y siempre de la marca del
// estudio: `--accent` para el trazo, `--accent-deep-muted` para los rellenos que
// dan color (L=74 sobre el mismo tono, ver `acentoDeEstudio`), `--card` para lo
// que tiene que leerse como papel. Nada de un cuarto color «bonito» de fuera:
// eso es lo que hace que una ilustración se vea pegada encima en vez de formar
// parte de la app.
const DIBUJOS: Record<NombreIlustracion, React.ReactNode> = {
  // Alguien sentada en la esterilla, con la pelota detrás. Es la firma del set:
  // la que sale cuando no hay clases, que es el vacío más frecuente.
  postura: (
    <Escena>
      {/* ⚠️ La pelota va SUELTA a un lado y apoyada en la esterilla, no detrás
          de ella: pegada al cuerpo se leía como un arbusto y le chocaba con el
          brazo. Y los brazos salen abiertos hasta las rodillas — pegados al
          torso el conjunto parecía una concha, no alguien sentada. */}
      <rect x="42" y="86" width="76" height="7" rx="3.5" fill="var(--accent-deep-muted)" />
      <circle cx="50" cy="78" r="8.5" fill="var(--accent-deep-muted)" stroke="var(--accent)" strokeWidth={2.4} />
      <path d="M62 86c0-6 8-10 18-10s18 4 18 10c0 3-8 5-18 5s-18-2-18-5Z" fill="var(--accent-deep-muted)" stroke="var(--accent)" strokeWidth={TRAZO} strokeLinejoin="round" />
      <circle cx="80" cy="37" r="8" fill="var(--accent)" />
      <path d="M80 47c-7 0-11 7-11 16 0 6 1 11 2 15" {...trazo} />
      <path d="M80 47c7 0 11 7 11 16 0 6-1 11-2 15" {...trazo} />
      <path d="M70 55c-6 5-9 13-8 22" {...trazo} />
      <path d="M90 55c6 5 9 13 8 22" {...trazo} />
    </Escena>
  ),

  // Un día sin nada en la agenda: la hoja dice que no es una avería, es que no
  // hay clase.
  calendario: (
    <Escena>
      <rect x="50" y="34" width="60" height="54" rx="10" fill="var(--card)" stroke="var(--accent)" strokeWidth={TRAZO} />
      <path d="M50 50h60" {...trazo} />
      <path d="M65 28v10M95 28v10" {...trazo} />
      <path d="M80 62c-4-4-11-2-11 4 0 5 7 9 11 12 4-3 11-7 11-12 0-6-7-8-11-4Z" fill="var(--accent-deep-muted)" stroke="var(--accent)" strokeWidth={2.6} strokeLinejoin="round" />
    </Escena>
  ),

  // Se ha buscado y no hay: la lupa vacía, no un error.
  busqueda: (
    <Escena>
      <circle cx="73" cy="52" r="21" fill="var(--accent-deep-muted)" stroke="var(--accent)" strokeWidth={TRAZO} />
      <path d="M88 67l13 13" {...trazo} strokeWidth={4.2} />
      <path d="M65 52h16" {...trazo} strokeWidth={2.8} />
      <path d="M100 30l1.5 4.1 4.1 1.5-4.1 1.5L100 41l-1.5-4.1L94.4 35.6l4.1-1.5L100 30Z" fill="var(--accent)" />
    </Escena>
  ),

  // El bono, con sus sesiones como puntos: se entiende sin leer.
  bono: (
    <Escena>
      <rect x="48" y="42" width="64" height="40" rx="8" fill="var(--card)" stroke="var(--accent)" strokeWidth={TRAZO} />
      <path d="M48 56h64" {...trazo} strokeWidth={2.4} />
      <rect x="48" y="42" width="64" height="14" rx="8" fill="var(--accent-deep-muted)" />
      <path d="M48 56h64" {...trazo} strokeWidth={2.4} />
      <circle cx="61" cy="69" r="3.8" fill="var(--accent)" />
      <circle cx="73" cy="69" r="3.8" fill="var(--accent-deep-muted)" />
      <circle cx="85" cy="69" r="3.8" fill="var(--accent-deep-muted)" />
      <circle cx="97" cy="69" r="3.8" fill="var(--accent-deep-muted)" />
    </Escena>
  ),

  // La tienda todavía sin nada colgado.
  tienda: (
    <Escena>
      <path d="M54 48h52l-4.5 36a6 6 0 0 1-6 5.2H64.5a6 6 0 0 1-6-5.2L54 48Z" fill="var(--card)" stroke="var(--accent)" strokeWidth={TRAZO} strokeLinejoin="round" />
      <path d="M56.7 68h46.6l-1.8 16a6 6 0 0 1-6 5.2H64.5a6 6 0 0 1-6-5.2L56.7 68Z" fill="var(--accent-deep-muted)" />
      <path d="M54 48h52l-4.5 36a6 6 0 0 1-6 5.2H64.5a6 6 0 0 1-6-5.2L54 48Z" {...trazo} strokeLinejoin="round" />
      <path d="M69 52V42a11 11 0 0 1 22 0v10" {...trazo} />
    </Escena>
  ),

  // Nada que avisar. La campana está quieta, no rota. Mismo dibujo que la
  // campana de la cabecera, para que el icono y la ilustración rimen.
  campana: (
    <Escena>
      <path d="M62 76c4-4 5-9 5-15v-7a13 13 0 0 1 26 0v7c0 6 1 11 5 15H62Z" fill="var(--accent-deep-muted)" stroke="var(--accent)" strokeWidth={TRAZO} strokeLinejoin="round" />
      <path d="M74 82a6 6 0 0 0 12 0" {...trazo} />
      <path d="M80 38v-6" {...trazo} />
      <path d="M103 56c3-2 5-6 5-10" {...trazo} strokeWidth={2.4} />
      <path d="M57 56c-3-2-5-6-5-10" {...trazo} strokeWidth={2.4} />
    </Escena>
  ),

  // Sin tarjeta guardada.
  tarjeta: (
    <Escena>
      <rect x="48" y="44" width="64" height="42" rx="8" fill="var(--card)" stroke="var(--accent)" strokeWidth={TRAZO} />
      <rect x="48" y="52" width="64" height="10" fill="var(--accent-deep-muted)" />
      <path d="M48 52h64M48 62h64" {...trazo} strokeWidth={2.4} />
      <path d="M58 74h12" {...trazo} strokeWidth={2.8} />
      <circle cx="93" cy="74" r="4.6" fill="var(--accent-deep-muted)" />
      <circle cx="100" cy="74" r="4.6" fill="var(--accent)" />
    </Escena>
  ),

  // Logros todavía sin configurar.
  trofeo: (
    <Escena>
      <path d="M66 32h28v17a14 14 0 0 1-28 0V32Z" fill="var(--accent-deep-muted)" stroke="var(--accent)" strokeWidth={TRAZO} strokeLinejoin="round" />
      <path d="M66 36h-7a7 7 0 0 0 7 7M94 36h7a7 7 0 0 1-7 7" {...trazo} strokeWidth={2.4} />
      <path d="M80 63v8" {...trazo} />
      <path d="M74 71h12l2.5 12h-17L74 71Z" fill="var(--card)" stroke="var(--accent)" strokeWidth={2.6} strokeLinejoin="round" />
    </Escena>
  ),

  // Conversaciones y tablón: dos globos, uno del estudio y otro suyo.
  charla: (
    <Escena>
      <path d="M50 36h40a9 9 0 0 1 9 9v20a9 9 0 0 1-9 9H68l-11 8v-8h-7a9 9 0 0 1-9-9V45a9 9 0 0 1 9-9Z" fill="var(--card)" stroke="var(--accent)" strokeWidth={TRAZO} strokeLinejoin="round" />
      <path d="M56 49h28M56 60h18" {...trazo} strokeWidth={2.6} />
      <path d="M100 62h8a6 6 0 0 1 6 6v11a6 6 0 0 1-6 6h-3v6l-8-6h-1" fill="var(--accent-deep-muted)" stroke="var(--accent)" strokeWidth={2.6} strokeLinejoin="round" />
    </Escena>
  ),

  // Recibos e historial: un papel con sus líneas y el borde dentado.
  recibo: (
    <Escena>
      <path d="M56 30h48v58l-6-4.5-6 4.5-6-4.5-6 4.5-6-4.5-6 4.5-6-4.5-6 4.5V30Z" fill="var(--card)" stroke="var(--accent)" strokeWidth={TRAZO} strokeLinejoin="round" />
      <path d="M66 46h28M66 57h28" {...trazo} strokeWidth={2.4} />
      <circle cx="94" cy="70" r="9" fill="var(--accent-deep-muted)" />
      <path d="M66 70h14" {...trazo} strokeWidth={2.4} />
    </Escena>
  ),
};

/**
 * Una ilustración del set. Decorativa: el título y el cuerpo del estado vacío
 * dicen lo que hay que decir, así que va `aria-hidden` y sin `role="img"`.
 */
export function Ilustracion({ nombre, alto = 104, style }: {
  nombre: NombreIlustracion;
  alto?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 160 120"
      height={alto}
      width={alto * (160 / 120)}
      style={{ display: 'block', ...style }}
    >
      {DIBUJOS[nombre]}
    </svg>
  );
}
