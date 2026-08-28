import type { Metadata } from 'next';
import { Rocket, Sparkles, Gauge, Wrench } from 'lucide-react';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { compararVersiones } from '@/lib/utils';
import { PageShell } from '@/components/recursos/PageShell';
import { SiteNav } from '@/components/recursos/SiteNav';
import { SiteFooter } from '@/components/recursos/SiteFooter';
import { OrganizationStructuredData } from '@/components/OrganizationStructuredData';
import { AyudaBreadcrumbs } from '@/components/ayuda/AyudaBreadcrumbs';
import { MUTED } from '@/components/landing/theme';
import { urlDe } from '@/lib/seo/paginas';

export const metadata: Metadata = {
  title: 'Novedades de Tentare | Centro de Ayuda',
  description: 'Nuevas funcionalidades, mejoras y correcciones publicadas en Tentare, versión a versión.',
  alternates: { canonical: urlDe('/ayuda/novedades') },
};

const ETIQUETA: Record<string, { label: string; icon: typeof Sparkles }> = {
  NUEVA_FUNCIONALIDAD: { label: 'Nueva funcionalidad', icon: Sparkles },
  MEJORA: { label: 'Mejora', icon: Rocket },
  RENDIMIENTO: { label: 'Rendimiento', icon: Gauge },
  ARREGLO: { label: 'Arreglo', icon: Wrench },
};

const fecha = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

interface Cambio { id: string; etiqueta: string; texto: string; orden: number }
interface Version { id: string; version: string; titulo: string; fecha_publicacion: string; changelog_cambios: Cambio[] }

// Reusa la misma tabla que alimenta "Actualizaciones" dentro del panel de un
// estudio (components/layout/actualizaciones-widget.tsx) — no un changelog
// paralelo. La diferencia es el camino de lectura: el widget del panel lee
// directo de Supabase con RLS de sesión de estudio; esta página es pública
// (cualquier visitante, sin sesión), así que lee en el servidor con el cliente
// admin, exactamente igual que hace app/sitemap.ts para contenido público
// derivado de la base de datos.
export default async function NovedadesPage() {
  const admin = getSupabaseAdmin();
  let versiones: Version[] = [];
  if (admin) {
    const { data } = await admin
      .from('changelog_versiones')
      .select('id, version, titulo, fecha_publicacion, changelog_cambios(id, etiqueta, texto, orden)')
      .eq('estado', 'publicado')
      .order('fecha_publicacion', { ascending: false });
    versiones = [...(data ?? [])].sort((a, b) =>
      a.fecha_publicacion === b.fecha_publicacion ? compararVersiones(b.version, a.version) : b.fecha_publicacion.localeCompare(a.fecha_publicacion));
  }

  const migas = [{ label: 'Inicio', href: '/ayuda' }, { label: 'Novedades' }];

  return (
    <PageShell>
      <OrganizationStructuredData />
      <SiteNav backHref="/ayuda" backLabel="Centro de Ayuda" />

      <header style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(32px,5vw,56px) clamp(20px,4vw,44px) 8px' }}>
        <AyudaBreadcrumbs items={migas} />
        <h1 style={{ fontWeight: 800, fontSize: 'clamp(28px,3.6vw,40px)', letterSpacing: '-.03em', margin: '0 0 12px' }}>Novedades de Tentare</h1>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: MUTED, margin: 0 }}>Lo último que hemos lanzado, versión a versión.</p>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px clamp(20px,4vw,44px) clamp(56px,7vw,80px)' }}>
        {versiones.length === 0 && (
          <p style={{ color: MUTED }}>Todavía no hay versiones publicadas.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {versiones.map((v) => (
            <article key={v.id} style={{ borderLeft: '2px solid #E7E7E0', paddingLeft: 22 }}>
              <p className="lp-mono" style={{ fontSize: 12, color: '#8E8E86', margin: '0 0 6px' }}>{fecha(v.fecha_publicacion)} · v{v.version}</p>
              <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.01em', margin: '0 0 14px' }}>{v.titulo}</h2>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[...v.changelog_cambios].sort((a, b) => a.orden - b.orden).map((c) => {
                  const info = ETIQUETA[c.etiqueta] ?? ETIQUETA.MEJORA;
                  const Icon = info.icon;
                  return (
                    <li key={c.id} style={{ display: 'flex', gap: 10, fontSize: 14.5, lineHeight: 1.5 }}>
                      <Icon size={15} style={{ flex: 'none', color: '#8E8E86', marginTop: 3 }} aria-hidden />
                      <span>{c.texto}</span>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <SiteFooter links={[{ href: '/ayuda', label: 'Centro de Ayuda' }]} />
    </PageShell>
  );
}
