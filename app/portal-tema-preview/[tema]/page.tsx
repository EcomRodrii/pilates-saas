import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PortalApp } from '@/components/portal-tema/PortalApp';
import { fetchPublicStudioData } from '@/lib/db/supabase-data-admin';
import { construirDatosPortal } from '@/lib/portal-tema/datos';
import type { DatosPortal } from '@/lib/portal-tema/tipos';
import { TEMAS_PORTAL, TEMAS_PORTAL_IDS, esTemaPortal } from '@/themes/registro';
import '@/components/portal-tema/portal-tema.css';

/**
 * Previsualización del portal en React, un tema por URL.
 *
 * No es una pantalla de producto. Existe para poder MIRAR los tres temas
 * mientras se conecta el portal de verdad — ni `tsc` ni el lint enseñan una
 * tipografía que no resuelve, una hoja que no carga o un adaptador que traduce
 * mal una clase real.
 *
 * Con `?estudio=<slug>` pinta los datos REALES de ese estudio, y es el único
 * consumidor que tiene hoy `construirDatosPortal`. Solo el catálogo público:
 * se llama a `fetchPublicStudioData` SIN socia, así que no entra ni un dato
 * personal de nadie — lo mismo que ya enseña `/reservar/[slug]` a cualquiera.
 *
 * Se cae en producción a propósito. Cuando el portal nuevo esté montado detrás
 * de su flag, esta ruta sobra y se borra entera.
 */
export const dynamic = 'force-dynamic';

/**
 * El catálogo del estudio → lo que pinta el portal. Sin socia: solo público.
 *
 * Devuelve `null` ante CUALQUIER fallo, incluida una excepción: sin
 * `SUPABASE_SERVICE_ROLE_KEY` en el entorno, `fetchPublicStudioData` lanza, y
 * sin este `try` la página entera se cae con "Algo se ha roto" en vez de
 * enseñar los datos de muestra. Es una pantalla para mirar temas: que no haya
 * base de datos no debería impedir mirarlos.
 */
async function datosDelEstudio(slug: string): Promise<{ datos: DatosPortal; nombre: string } | null> {
  const publico = await fetchPublicStudioData(slug).catch(() => null);
  if (!publico) return null;
  return {
    nombre: publico.studio.nombre,
    datos: construirDatosPortal({
      ahora: new Date(),
      sesiones: publico.sesiones,
      // `spot_id` viaja para saber qué plazas están cogidas. El catálogo
      // público ya lo trae (va anonimizado: la plaza, no quién la ocupa).
      reservas: publico.aforoReservas.map((r) => ({
        sesionId: r.sesion_id, estado: r.estado as never, spotId: r.spot_id ?? null,
      })),
      spots: publico.spots,
      tiposClase: publico.tiposClase,
      salas: publico.salas,
      instructores: publico.instructores,
      planes: publico.planesTarifa,
      // Sin sesión de socia no hay bono ni nombre que enseñar, y es lo
      // correcto: esta pantalla es para mirar el tema, no para suplantar a
      // nadie. El portal ya sabe pintarse con ambos vacíos.
      socio: null,
      suscripciones: [],
    }),
  };
}

export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ tema: string }>;
  searchParams: Promise<{ estudio?: string }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { tema } = await params;
  if (!esTemaPortal(tema)) notFound();
  const config = TEMAS_PORTAL[tema];

  const { estudio } = await searchParams;
  const real = estudio ? await datosDelEstudio(estudio) : null;

  const enlace = (id: string) => `/portal-tema-preview/${id}${estudio ? `?estudio=${encodeURIComponent(estudio)}` : ''}`;

  return (
    <main className="portal-tema desk">
      <div className="desk__head">
        <p className="desk__eyebrow">Tentare · Previsualización del portal</p>
        <h1 className="desk__title">Tema {config.name}</h1>
        <p className="desk__text">
          {estudio
            ? real
              ? `Datos reales de ${real.nombre} — solo el catálogo público, sin socia.`
              : `No hay ningún estudio con el slug «${estudio}». Se pintan los datos de muestra.`
            : config.tagline}
        </p>
        <div className="desk__actions">
          {TEMAS_PORTAL_IDS.map((id) => (
            <Link key={id} href={enlace(id)} className="desk__button">
              {TEMAS_PORTAL[id].name}
            </Link>
          ))}
        </div>
      </div>
      <PortalApp tema={config} datos={real?.datos} />
    </main>
  );
}
