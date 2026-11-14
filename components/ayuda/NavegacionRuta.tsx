import Link from 'next/link';
import './academy.css';

export interface EnlaceRuta { href: string; titulo: string }

/** Anterior y siguiente dentro de la ruta de Academy a la que pertenece la guía. Sin ruta, no se pinta. */
export function NavegacionRuta({ rutaTitulo, anterior, siguiente }: { rutaTitulo: string; anterior: EnlaceRuta | null; siguiente: EnlaceRuta | null }) {
  if (!anterior && !siguiente) return null;
  return (
    <nav className="ac-ruta-nav" aria-label={`Ruta: ${rutaTitulo}`}>
      {anterior && <Link className="ac-enlace" href={anterior.href}><small>Anterior</small>{anterior.titulo}</Link>}
      {siguiente && <Link className="ac-enlace ac-enlace--sig" href={siguiente.href}><small>Siguiente</small>{siguiente.titulo}</Link>}
    </nav>
  );
}
