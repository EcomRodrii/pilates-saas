import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // URL limpia para el origen dedicado de temas ZIP publicados
  // (`imports.tentare.app/<slug>` en vez de `/tema-publicado/<slug>`). Esto
  // es SOLO azúcar de URL — la cerradura real de seguridad vive DENTRO del
  // route handler (`app/tema-publicado/[slug]/[[...ruta]]/route.ts`,
  // `hostAutorizado()`), porque Next enruta por pathname, no por `Host`: la
  // ruta de destino sigue siendo alcanzable desde `tentare.app` con o sin
  // este rewrite. Sin `NEXT_PUBLIC_IMPORTS_HOST` configurado (local, preview
  // deploys) no se añade ninguna regla — nunca una regla que use `undefined`
  // como valor de host y acabe matcheando cualquier cosa.
  async rewrites() {
    const host = process.env.NEXT_PUBLIC_IMPORTS_HOST;
    if (!host) return [];
    return [
      {
        source: '/:slug/:ruta*',
        has: [{ type: 'host', value: host }],
        destination: '/tema-publicado/:slug/:ruta*',
      },
    ];
  },
};

// Sentry envuelve la config de build. La subida de source maps solo ocurre si
// hay SENTRY_AUTH_TOKEN + org/project; si no, se omite sin romper el build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
