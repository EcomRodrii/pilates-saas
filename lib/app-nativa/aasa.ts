// El fichero de enlaces universales de iOS (`/.well-known/apple-app-site-association`):
// le dice a iOS qué direcciones de tentare.app abre la app en vez de Safari.
// Lo que importa que vuelva a la app: el enlace del correo (/app y /portal/<slug>/acceso/…)
// y la vuelta de un pago con Bizum o Stripe Checkout (/portal/<slug>/bonos, /pagos).
// El panel y la web comercial, no: siguen en Safari.
//
// Sin el Team ID de Apple no hay nada que publicar (404): no se sirve un fichero a
// medias que iOS cachearía. Las apps por estudio salen de `apps_estudio` (las
// activas, con la cuenta de Tentare); las de OTRO equipo de Apple, si algún día las hay,
// se añaden en APPLE_APP_IDS («TEAM.bundle», separadas por comas).

/** `TEAMID.bundle.id` a partir de las variables de entorno, o `[]` si falta el equipo. */
export function idsDeApps(env: Record<string, string | undefined> = process.env): string[] {
  const team = env.APPLE_TEAM_ID?.trim();
  const propias = team ? [`${team}.${env.TENTARE_APP_ID?.trim() || 'app.tentare'}`] : [];
  const extra = (env.APPLE_APP_IDS ?? '').split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(s));
  return [...new Set([...propias, ...extra])];
}

/** La app de tienda de un estudio activa: su `TEAMID.bundle` y el slug de SU estudio. */
export interface AppDeEstudioAasa { appId: string; slug: string }

/**
 * `appsEstudio`: cada app de estudio reclama SOLO las rutas de su estudio
 * (`/portal/<slug>`), no `/app` ni `/portal/*`. Van ANTES de la entrada general: iOS
 * toma la primera que encaja, y si fuera detrás, `/portal/*` de la app «Tentare» se
 * las comería todas. Sin ninguna, el fichero es el de siempre.
 */
export function contenidoAasa(appIds: readonly string[], appsEstudio: readonly AppDeEstudioAasa[] = []) {
  const detallesDeEstudios = appsEstudio.map((a) => ({
    appIDs: [a.appId],
    components: [
      { '/': `/portal/${a.slug}`, comment: 'La app de este estudio' },
      { '/': `/portal/${a.slug}/*` },
    ],
  }));
  return {
    applinks: {
      details: [
        ...detallesDeEstudios,
        {
          appIDs: [...appIds],
          components: [
            { '/': '/app', comment: 'Entrada de la app y vuelta del enlace del correo' },
            { '/': '/app/*' },
            { '/': '/portal/*', comment: 'La app de cada estudio: acceso, pagos, reservas' },
          ],
        },
      ],
    },
    // Autorrelleno de contraseñas guardadas en el llavero para tentare.app.
    webcredentials: { apps: [...new Set([...appIds, ...appsEstudio.map((a) => a.appId)])] },
  };
}

/** `TEAMID.bundle` de una app de estudio, o `null` si falta el equipo o el bundle no vale. */
export function appIdDeEstudio(team: string | undefined, bundle: string): string | null {
  const t = team?.trim();
  return t && /^[A-Z0-9]{10}$/.test(t) && /^[A-Za-z0-9.-]+$/.test(bundle) ? `${t}.${bundle}` : null;
}
