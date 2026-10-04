import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { iconoDelEstudio } from '@/lib/app-nativa/icono-estudio';
import { imagenDeEstudio } from '@/lib/imagenes-por-defecto';
import { Foto } from '@/components/student/ui/Foto';
import { Icono } from '@/components/student/ui/Icono';

// La ficha de un estudio en la app de iOS, al elegirlo en el buscador de `/app`:
// su portada, su icono, su nombre y su ciudad, y dos caminos. «Ver horario» abre
// su página pública de reservas, que se mira sin cuenta (la cuenta se pide al
// reservar: bsport lo estrenó en 2026 y es lo que más convierte). «Ya voy aquí»
// vuelve a la entrada con `?estudio=`, que la lleva dentro al tener sesión, o a
// darse de alta en él si aún no la tiene.
//
// Lo mismo que ya es público en /reservar/<slug>, y solo de estudios con la página
// abierta. No se indexa (`/app` está en PREFIJOS_NO_INDEXABLES).

export const dynamic = 'force-dynamic';

const SLUG = /^[a-z0-9-]{1,80}$/;

export default async function FichaEstudio({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const admin = getSupabaseAdmin();
  if (!admin) notFound();
  const { data: e } = await admin.from('studios')
    .select('id, slug, nombre, ciudad, logo_url, color_primario, imagen_bienvenida_url, pagina_publica_oculta')
    .eq('slug', slug).maybeSingle();
  if (!e || e.pagina_publica_oculta === true) notFound();

  const nombre = (e.nombre as string | null)?.trim() || slug;
  const ciudad = (e.ciudad as string | null)?.trim() || null;
  const icono = await iconoDelEstudio({ id: e.id as string, nombre, logo_url: e.logo_url as string | null, color_primario: e.color_primario as string | null });
  const portada = imagenDeEstudio('portada', e.imagen_bienvenida_url as string | null, slug);

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--background)' }}>
      <div style={{ position: 'relative', height: 'calc(230px + var(--safe-top, 0px))', overflow: 'hidden', background: '#0F0F0C' }}>
        <Foto src={portada} ancho={640} alto={460} sizes="100vw" prioritaria style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,8,8,.45), rgba(8,8,8,.05) 45%, rgba(8,8,8,.35))' }} />
        <Link href="/app" style={{ position: 'absolute', top: 'calc(14px + var(--safe-top, 0px))', left: 16, display: 'flex', alignItems: 'center', gap: 4, color: '#fff', fontWeight: 800, fontSize: 'var(--t-small)', textDecoration: 'none', padding: 6 }}>
          <Icono nombre="chevron-izquierda" tamano={16} /> Volver
        </Link>
      </div>
      <div style={{ maxWidth: 440, margin: '-44px auto 0', padding: '0 22px calc(28px + var(--safe-bottom, 0px))', position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- icono servido por nuestra propia ruta */}
        <img src={icono} alt="" width={84} height={84} style={{ borderRadius: 22, border: '4px solid var(--background)', background: 'var(--card)' }} />
        <div>
          <h1 className="t-h1" style={{ margin: 0 }}>{nombre}</h1>
          {ciudad && <p className="t-meta" style={{ marginTop: 4 }}>{ciudad}</p>}
        </div>
        <Link href={`/reservar/${encodeURIComponent(slug)}`} className="btn btn--primary btn--full" data-testid="ver-horario">Ver horario</Link>
        <Link href={`/app?estudio=${encodeURIComponent(slug)}`} className="btn btn--secondary btn--full" data-testid="ya-voy">Ya voy aquí: entrar</Link>
        <p className="t-meta" style={{ margin: 0 }}>Puedes mirar las clases sin cuenta. Te la pedimos al reservar.</p>
      </div>
    </main>
  );
}
