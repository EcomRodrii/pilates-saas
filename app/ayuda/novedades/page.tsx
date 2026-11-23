import type { Metadata } from 'next';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { compararVersiones } from '@/lib/utils';
import { PageShell } from '@/components/recursos/PageShell';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { AyudaMarco } from '@/components/ayuda/AyudaMarco';
import { ListaNovedades, type VersionNovedad } from '@/components/ayuda/lista-novedades';
import { BannerEdicion } from '@/components/edicion/banner-edicion';
import { urlDe } from '@/lib/seo/paginas';

export const metadata: Metadata = {
  title: 'Novedades de Tentare | Centro de Ayuda',
  description: 'Nuevas funcionalidades, mejoras y correcciones publicadas en Tentare, versión a versión.',
  alternates: { canonical: urlDe('/ayuda/novedades') },
};

// Con la forma del changelog de Shopify (23-nov-2026): título grande, el banner de la edición arriba, línea de tiempo y filtros.
// Reusa la misma tabla que alimenta «Actualizaciones» dentro del panel (`changelog_versiones`), no un changelog paralelo. Esta página
// es pública (sin sesión), así que lee en el servidor con el cliente admin, igual que app/sitemap.ts.
export const revalidate = 300;

export default async function NovedadesPage() {
  const admin = getSupabaseAdmin();
  let versiones: VersionNovedad[] = [];
  if (admin) {
    const { data } = await admin
      .from('changelog_versiones')
      .select('id, version, titulo, fecha_publicacion, changelog_cambios(id, etiqueta, texto, orden)')
      .eq('estado', 'publicado')
      .order('fecha_publicacion', { ascending: false });
    versiones = [...(data ?? [])]
      .sort((a, b) => (a.fecha_publicacion === b.fecha_publicacion ? compararVersiones(b.version, a.version) : b.fecha_publicacion.localeCompare(a.fecha_publicacion)))
      .map((v) => ({
        id: v.id, version: v.version, titulo: v.titulo, fecha_publicacion: v.fecha_publicacion,
        cambios: [...(v.changelog_cambios ?? [])].sort((a, b) => a.orden - b.orden),
      }));
  }

  return (
    <PageShell>
      <OrganizationStructuredData />
      <AyudaMarco ancho={1024}>
        <p className="nv-sobre">Novedades</p>
        <h1 className="nv-h1">Lo nuevo en Tentare</h1>
        <BannerEdicion className="nv-edicion" />
        {versiones.length === 0
          ? <p className="ay-intro" style={{ marginTop: 40 }}>Todavía no hay versiones publicadas.</p>
          : <ListaNovedades versiones={versiones} />}
      </AyudaMarco>
    </PageShell>
  );
}
