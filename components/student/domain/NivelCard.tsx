'use client';

import Link from 'next/link';
import type { GamificacionVista } from '@/lib/student/tipos';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { Icono } from '@/components/student/ui/Icono';

// «Tus créditos» en Inicio: el saldo, lo que da cada clase y el nivel.
// Solo si el estudio usa gamificación — sin configurar, no se pinta nada en
// vez de un tablero a cero. Un toque lleva a la pantalla completa.
//
// ⚠️ EL SALDO MANDA. La tarjeta se llamaba «Tu nivel» y el saldo iba en letra
// pequeña en una esquina: el fundador lo buscó y no lo encontró (17-sep). Es la
// cifra que se viene a mirar, así que encabeza la tarjeta; debajo, lo que da
// cada clase —la otra pregunta: «¿y cuántos gano viniendo?»— y el nivel.
//
// ⚠️ COMPOSICIÓN del nivel. Es lo único de esta app que tiene una IDENTIDAD —un
// icono y un nombre que el estudio ha elegido—: el emblema ocupa su sitio a la
// izquierda y el texto se ordena a su lado, que es como se lee un distintivo.
//
// Lo que NO cambia: si no hay nivel siguiente no se inventa una meta, y los
// créditos son los que dice el servidor.
export function NivelCard({ g, href, creditosNombre }: { g: GamificacionVista; href: string; creditosNombre?: string | null }) {
  // Entra por prop y no desde el contexto: esta tarjeta la pinta Inicio, que ya
  // tiene el estudio a mano, y así el componente sigue siendo puro de datos.
  const moneda = nombreCreditos(creditosNombre);
  if (!g.hay) return null;
  const { actual, siguiente, faltan, progreso } = g.nivel;
  const pct = Math.round(progreso * 100);
  // Un estudio puede dar créditos sin haber creado niveles: entonces no hay
  // emblema ni meta que enseñar, y un disco vacío sería decorado.
  const hayNiveles = Boolean(actual || siguiente);

  return (
    <Link
      href={href}
      className="card card--tap card--pad-lg stack"
      data-testid="nivel-inicio"
      style={{ ['--gap' as string]: 'var(--s-3)' }}
    >
      <div className="row row--between" style={{ alignItems: 'baseline' }}>
        <p className="t-label">Tus {moneda}</p>
        <span className="t-title t-num no-shrink row" data-testid="saldo-inicio" style={{ color: 'var(--accent)', ['--gap' as string]: '2px', alignItems: 'center' }}>
          {g.saldo}
          <Icono nombre="chevron-derecha" tamano={18} aria-hidden />
        </span>
      </div>

      {hayNiveles && (
        <div className="row" style={{ ['--gap' as string]: 'var(--s-3)' }}>
          {/* El emblema. Sin nivel todavía, el disco se queda vacío en lugar de
              enseñar un icono prestado: es el sitio donde irá el suyo. */}
          <span
            aria-hidden
            className="avatar"
            style={{ ['--size' as string]: '46px', fontSize: 24, background: actual ? 'var(--accent-soft)' : 'var(--muted)' }}
          >
            {actual?.icono ?? ''}
          </span>
          <div className="stack" style={{ ['--gap' as string]: '2px', minWidth: 0 }}>
            <p className="t-card-title trunc">{actual ? actual.nombre : `Empieza a sumar ${moneda}`}</p>
            {siguiente
              ? <p className="t-meta">Te faltan {faltan} para {siguiente.nombre}</p>
              : actual && <p className="t-meta">Has llegado al último nivel</p>}
          </div>
        </div>
      )}

      {siguiente && (
        <div aria-hidden className="bar" style={{ ['--pct' as string]: `${pct}%` }}><i /></div>
      )}

      {/* Solo si el estudio premia la asistencia (regla ACTIVA): prometer
          créditos que no llegan es peor que no decir nada. */}
      {g.creditosPorClase != null && (
        <p className="t-meta" data-testid="por-clase-inicio">+{g.creditosPorClase} por cada clase</p>
      )}
    </Link>
  );
}
