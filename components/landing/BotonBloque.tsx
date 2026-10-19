import Link from 'next/link';
import { CTA_ALTA } from '@/lib/landing/founding-gratis';
import { ALTA } from './enlaces';

// El botón que cierra cada bloque de beneficio (ronda 3, 19-oct-2026). Es la
// forma de Mariana Tek: quien se convence a mitad de página no tiene que bajar
// hasta la banda final para actuar. Siempre el mismo verbo (`CTA_ALTA`), siempre
// el mismo destino (el alta) y siempre la misma forma de botón.
//
// `tono` es el fondo del bloque en el que va, no una variante de marca: sobre
// claro, el botón del héroe (relleno oliva, texto arena); sobre oscuro, el de los
// planes (relleno arena, texto oliva). Los estilos viven en GlobalStyles
// (`.lp-boton-bloque`) para que ocho botones no pinten ocho hojas de estilo.
//
// La medición no necesita nada aquí: MedicionLanding lee el id de la sección que
// contiene el enlace y lo cuenta con su nombre.

export function BotonBloque({ tono = 'claro', className = '' }: { tono?: 'claro' | 'oscuro'; className?: string }) {
  return (
    <Link href={ALTA} className={`lp-boton-bloque lp-boton-bloque-${tono} ${className}`.trim()}>{CTA_ALTA}</Link>
  );
}
