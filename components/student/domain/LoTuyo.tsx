'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LoQueTengo } from '@/lib/student/lo-que-tengo';
import { resumenClaseFija, textoHasta, textoRecuperaciones, textoRenovacionCorto, textoSaldoDe } from '@/lib/student/mi-plan-vista';
import { textoTopes } from '@/lib/student/saldo-bono';
import { euros } from '@/lib/student/formato';
import { useSemanaCuota } from '@/components/student/domain/SemanaCuota';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// «Lo tuyo» (Inicio; maqueta «Clase fija y bonos, ordenados», 6-oct-2026): UNA tarjeta en vez de «Tu ritmo» y «Tu clase
// fija», con una línea por cosa —tu cuota o tu bono, tu clase fija, tus recuperaciones— y cada línea lleva a su sitio:
// la cuota, el bono y las recuperaciones a Mi plan; la clase fija a Mis clases → Clase fija.
//
// Lo que tiene sale del MISMO selector que Mi plan y Perfil (`loQueTengo`). «Esta semana 1 de 2» es la cuenta del
// servidor (`useSemanaCuota`, la misma que Mi plan); mientras llega, el tope en palabras, nunca un cero inventado.

function Linea({ icono, href, titulo, sub, testId }: { icono: NombreIcono; href: string; titulo: ReactNode; sub?: string | null; testId: string }) {
  return (
    <Link href={href} data-testid={testId} className="tap" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border)', color: 'inherit', textDecoration: 'none' }}>
      <span aria-hidden style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)' }}>
        <Icono nombre={icono} tamano={19} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--t-body)' }}>{titulo}</span>
        {sub && <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{sub}</span>}
      </span>
      <span aria-hidden style={{ display: 'flex', color: 'var(--subtle-foreground)' }}><Icono nombre="chevron-derecha" tamano={16} /></span>
    </Link>
  );
}

export function LoTuyo({ slug, t, hoy, racha, hrefMiPlan, hrefClaseFija, hrefTienda, debe = null }: {
  slug: string;
  t: LoQueTengo;
  hoy: string;
  /** Semanas seguidas viniendo (`rachaSemanas`); 0 = no se enseña. */
  racha: number;
  hrefMiPlan: string;
  hrefClaseFija: string;
  /** Sin cuota ni bono, la tienda (solo si el estudio vende algo). */
  hrefTienda: string | null;
  /** Un recibo de su cuota sin pagar: se dice en la línea de la cuota, en vez de la próxima renovación. */
  debe?: { importe: number } | null;
}) {
  // El MISMO criterio que la tarjeta de la cuota: hay tope si lo hay en total o por actividad.
  const conTope = !!t.cuota && ((t.cuota.limiteSemanal ?? 0) > 0 || Object.keys(t.cuota.limitePorTipo ?? {}).length > 0);
  const { semana } = useSemanaCuota(slug, t.cuota?.id ?? null, conTope);
  // «X de Y» de la cuota son las que USA y del bono las que le QUEDAN: aquí, en una línea, se dice con palabras.
  const queda = semana && semana.limite !== null ? Math.max(0, semana.limite - semana.cuentan) : null;
  const semanaTexto = queda === null ? null : queda === 0 ? 'semana completa' : queda === 1 ? 'te queda 1 esta semana' : `te quedan ${queda} esta semana`;
  const fija = resumenClaseFija(t.fijas, hoy);
  const recup = textoRecuperaciones(t.recuperaciones);
  const sinPlan = !t.cuota && !t.bono;
  if (!t.cuota && !t.bono && !fija && !recup && !hrefTienda) return null;

  const tope = t.cuota ? (textoTopes(t.cuota, {}) ?? (conTope ? 'con máximo por actividad' : 'sin máximo semanal')) : '';
  return (
    <section className="card" data-testid="lo-tuyo" aria-label="Lo tuyo" style={{ padding: '14px 16px 4px' }}>
      <div className="row row--between" style={{ marginBottom: 6 }}>
        <p className="t-label" style={{ margin: 0 }}>Lo tuyo</p>
        {/* La racha solo aparece si existe: «0 sem.» no motiva a nadie. */}
        {racha > 0 && (
          <p className="t-num t-dim no-shrink" data-testid="lo-tuyo-racha" style={{ margin: 0, fontSize: 'var(--t-meta)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Icono nombre="racha" tamano={14} />{racha} {racha === 1 ? 'semana' : 'semanas'} seguidas
          </p>
        )}
      </div>
      {t.cuota && (
        <Linea
          icono="bono" href={hrefMiPlan} testId="lo-tuyo-cuota"
          titulo={<><b>Tu cuota</b> · {semanaTexto ?? tope}</>}
          sub={debe ? `Pago pendiente · ${euros(debe.importe)}` : textoRenovacionCorto(t.cuota)}
        />
      )}
      {t.bono && t.saldo && (
        <Linea
          icono="bono" href={hrefMiPlan} testId="lo-tuyo-bono"
          titulo={<><b>Tu bono</b> · {t.saldo.de != null ? `${t.saldo.quedan} de ${t.saldo.de}` : textoSaldoDe(t.saldo)}</>}
          sub={`${t.bono.nombre} · ${textoHasta(t.bono).toLowerCase()}`}
        />
      )}
      {fija && (
        <Linea icono="calendario" href={hrefClaseFija} testId="lo-tuyo-fija" titulo={<><b>{fija.titulo}</b> · {fija.dias}</>} sub={fija.sub} />
      )}
      {recup && <Linea icono="racha" href={hrefMiPlan} testId="lo-tuyo-recuperaciones" titulo={<b>{recup.titulo}</b>} sub={recup.sub} />}
      {sinPlan && hrefTienda && (
        <Linea icono="bolsa" href={hrefTienda} testId="lo-tuyo-sin-plan" titulo={<b>Sin cuota ni bono</b>} sub="Mira lo que tiene tu estudio en la tienda" />
      )}
    </section>
  );
}
