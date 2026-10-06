'use client';

import type { Bono } from '@/lib/student/tipos';
import { textoTopes } from '@/lib/student/saldo-bono';
import { SemanaCuota } from '@/components/student/domain/SemanaCuota';

// Su cuota con tope (P4-E): el tope en palabras y «Esta semana», debajo de la tarjeta de la cuota. Solo se pinta con
// algún tope: sin él no hay nada que contar (y nunca se dice «sin límite»: hay topes por día que la app no conoce).
export function CuotaSemanaCard({ slug, cuota, nombresTipo }: { slug: string; cuota: Bono; nombresTipo: Record<string, string> }) {
  const topes = textoTopes(cuota, nombresTipo);
  if (!topes) return null;
  return (
    <section className="card card--pad" data-testid="cuota-semana" aria-label={`Tu semana con ${cuota.nombre}`}>
      <p className="t-label" style={{ margin: 0 }}>Tu cuota incluye</p>
      <p className="t-small" style={{ margin: '2px 0 0', fontWeight: 700 }}>{topes}</p>
      <SemanaCuota slug={slug} suscripcionId={cuota.id} nombresTipo={nombresTipo} />
    </section>
  );
}
