import { redirect } from 'next/navigation';

// La ficha aparte de una clase fija se retiró el 4-oct-2026: la misma clase tenía dos fichas distintas. Ahora es UNA,
// la del horario, con su interruptor «Clase fija». Esta ruta solo queda para los enlaces viejos.
export default async function FichaClaseFijaRetirada({ params }: { params: Promise<{ slug: string; sesionId: string }> }) {
  const { slug, sesionId } = await params;
  redirect(`/portal/${encodeURIComponent(slug)}/reservar/${encodeURIComponent(sesionId)}`);
}
