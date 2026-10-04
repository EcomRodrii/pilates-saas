import { redirect } from 'next/navigation';

// La página «Clases fijas» se retiró el 4-oct-2026: había cuatro caminos para pedir lo mismo y el estudio y sus
// alumnas se perdían. Una clase se hace fija desde su ficha (el interruptor «Clase fija») y las suyas se ven en
// «Mis clases → Fijas». Esta ruta solo queda para los enlaces viejos (avisos ya enviados, apps en caché).
export default async function ClasesFijasRetirada({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/portal/${encodeURIComponent(slug)}/mis-reservas?tab=fijas`);
}
