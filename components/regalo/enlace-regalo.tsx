'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// «Regala una tarjeta» en el pie de la página pública. Solo aparece si el estudio la vende de
// verdad (ajustes encendidos, cobro listo, captcha de servidor listo): un enlace a una página
// que dice «no disponible» es peor que no ponerlo. Una petición ligera, sin PII.
export function EnlaceRegalo({ slug }: { slug: string }) {
  const [aLaVenta, setALaVenta] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/public/regalo/info?slug=${encodeURIComponent(slug)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { aLaVenta?: boolean } | null) => { if (vivo && j?.aLaVenta) setALaVenta(true); })
      .catch(() => { /* sin enlace */ });
    return () => { vivo = false; };
  }, [slug]);
  if (!aLaVenta) return null;
  return (
    <Link href={`/reservar/${slug}/regalo`} data-testid="enlace-regalo"
      style={{ color: 'var(--portal-ink)', fontWeight: 700, fontSize: 13, textDecoration: 'underline' }}>
      Regala una tarjeta
    </Link>
  );
}
