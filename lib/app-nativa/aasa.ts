// El fichero de enlaces universales de iOS (`/.well-known/apple-app-site-association`):
// le dice a iOS qué direcciones de tentare.app abre la app en vez de Safari.
// Lo que importa que vuelva a la app: el enlace del correo (/app y /portal/<slug>/acceso/…)
// y la vuelta de un pago con Bizum o Stripe Checkout (/portal/<slug>/bonos, /pagos).
// El panel y la web comercial, no: siguen en Safari.
//
// Sin el Team ID de Apple no hay nada que publicar (404): no se sirve un fichero a
// medias que iOS cachearía. Las apps por estudio, cuando las haya, se añaden en
// APPLE_APP_IDS («TEAM.bundle», separadas por comas); cada una puede ser de un
// equipo distinto (la cuenta de Apple del estudio).

/** `TEAMID.bundle.id` a partir de las variables de entorno, o `[]` si falta el equipo. */
export function idsDeApps(env: Record<string, string | undefined> = process.env): string[] {
  const team = env.APPLE_TEAM_ID?.trim();
  const propias = team ? [`${team}.${env.TENTARE_APP_ID?.trim() || 'app.tentare'}`] : [];
  const extra = (env.APPLE_APP_IDS ?? '').split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(s));
  return [...new Set([...propias, ...extra])];
}

export function contenidoAasa(appIds: readonly string[]) {
  return {
    applinks: {
      details: [{
        appIDs: [...appIds],
        components: [
          { '/': '/app', comment: 'Entrada de la app y vuelta del enlace del correo' },
          { '/': '/app/*' },
          { '/': '/portal/*', comment: 'La app de cada estudio: acceso, pagos, reservas' },
        ],
      }],
    },
    // Autorrelleno de contraseñas guardadas en el llavero para tentare.app.
    webcredentials: { apps: [...appIds] },
  };
}
