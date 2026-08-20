'use client';

import Link from 'next/link';
import { capturarEvento } from '@/lib/posthog-cliente';

// `Link` con un evento de analítica al clic, para los pocos CTA de entrada
// al embudo que valen la pena medir (top-of-funnel: "quiso crear perfil"),
// sin convertir toda la página/nav que lo rodea a Client Component. Solo
// props estáticas (href/className/evento/children) — nunca un handler
// recibido de un padre Server Component, así que es seguro montarlo desde
// app/network/page.tsx o NavPublico sin el bug ya documentado en
// TarjetaInstructora.tsx.
export function EnlaceRastreo({
  href, evento, className, style, children,
}: {
  href: string;
  evento: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} style={style} onClick={() => capturarEvento(evento)}>
      {children}
    </Link>
  );
}
