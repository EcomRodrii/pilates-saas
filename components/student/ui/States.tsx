'use client';
import Link from 'next/link';
import { Button } from './Button';

// Los cuatro estados que toda pantalla necesita: vacío, error, sin conexión y
// cargando. Antes cada uno resolvía su composición con estilos en línea —cinco
// tamaños de letra y cuatro rellenos distintos entre los tres primeros—, así
// que dos pantallas vecinas podían enseñar el mismo estado con otra pinta.
// Aquí van sobre la escala del sistema (student.css).

/**
 * El icono, dentro de un disco suave en vez de suelto sobre el fondo.
 *
 * Un emoji a pelo se pinta con su propia paleta a todo color en medio de una
 * app de crema y oliva, y no se lee como parte del diseño sino como algo
 * pegado encima. Sobre el disco de acento tiene sitio propio, y el tamaño del
 * disco da la escala que antes ponía el `fontSize: 28`.
 */
function Disco({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="avatar"
      style={{ ['--size' as string]: '52px', fontSize: 24, background: 'var(--accent-soft)' }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icono = '📋', titulo, cuerpo, accion, href, onAccion }: {
  icono?: string; titulo: string; cuerpo?: string; accion?: string; href?: string; onAccion?: () => void;
}) {
  return (
    <div
      className="a-up stack"
      style={{
        ['--gap' as string]: 'var(--s-2)', alignItems: 'center', textAlign: 'center',
        border: '1.5px dashed var(--border-strong)',
        // Radio de «hero» (20px) y no el de tarjeta: es un bloque grande y
        // vacío, y con 16 se leía como una tarjeta a la que le falta contenido
        // en vez de como un marcador de sitio.
        borderRadius: 'var(--radius-hero)',
        padding: 'var(--s-7) var(--s-5)',
      }}
    >
      <Disco>{icono}</Disco>
      <p className="t-card-title" style={{ marginTop: 'var(--s-1)' }}>{titulo}</p>
      {/* Tope de ancho: un párrafo centrado que cruza los 390 px de un móvil
          se lee peor que uno de línea corta, y en escritorio la tarjeta llega a
          520. */}
      {cuerpo && <p className="t-small t-dim" style={{ maxWidth: 280 }}>{cuerpo}</p>}
      {accion && (href
        ? <Link href={href} className="btn btn--primary btn--sm tap" style={{ marginTop: 'var(--s-2)', boxShadow: 'none' }}>{accion}</Link>
        : <Button size="sm" style={{ marginTop: 'var(--s-2)', boxShadow: 'none' }} onClick={onAccion}>{accion}</Button>)}
    </div>
  );
}

export function ErrorState({
  titulo = 'Algo no ha salido como esperábamos',
  cuerpo = 'No hemos podido cargar esto. Tus datos están a salvo.',
  onRetry,
}: { titulo?: string; cuerpo?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="a-up card stack"
      style={{
        ['--gap' as string]: 'var(--s-2)', alignItems: 'center', textAlign: 'center',
        padding: 'var(--s-5) var(--s-5)',
        borderColor: 'var(--destructive-soft)', background: 'var(--destructive-soft)',
      }}
    >
      <p className="t-card-title" style={{ color: 'var(--destructive-foreground)' }}>{titulo}</p>
      <p className="t-small t-dim">{cuerpo}</p>
      {onRetry && <Button variant="secondary" style={{ marginTop: 'var(--s-1)' }} onClick={onRetry}>Intentar de nuevo</Button>}
    </div>
  );
}

export function OfflineState({
  cuerpo = 'Lo que ves es lo último que cargamos. Reservar, cancelar y pagar necesitan conexión.',
}: { cuerpo?: string }) {
  return (
    <div role="status" className="a-up card row row--top" style={{ ['--gap' as string]: 'var(--s-3)', padding: 'var(--s-4) var(--s-5)' }}>
      <Disco>📡</Disco>
      <div className="stack" style={{ ['--gap' as string]: 'var(--s-1)' }}>
        <p className="t-card-title">Sin conexión</p>
        <p className="t-small t-dim">{cuerpo}</p>
      </div>
    </div>
  );
}

export function Skeleton({ h = 14, w = '100%', r = 10, style }: {
  h?: number; w?: number | string; r?: number; style?: React.CSSProperties;
}) {
  return <div aria-hidden className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function ListSkeleton({ n = 3, h = 74 }: { n?: number; h?: number }) {
  return (
    <div aria-busy aria-label="Cargando" className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} h={h} r={16} />)}
    </div>
  );
}
