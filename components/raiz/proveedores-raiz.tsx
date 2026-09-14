'use client';

import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { esAppDeLaAlumna } from '@/lib/raiz/rutas-sin-proveedores';

// Los providers de sesión, montados en la raíz salvo en la app de la alumna.
//
// Siguen en la RAÍZ a propósito, y no en el layout de cada grupo de rutas: con
// una sola instancia, las navegaciones suaves entre panel, landing, /login o
// /suscripcion conservan el estado (y no repiten la carga del estudio).
//
// `next/dynamic` y no un import estático: con import estático el código viaja
// en la carga inicial de TODAS las rutas aunque aquí no se rendericen, que es
// justo lo que había. Con `dynamic`, en SSR se renderiza igual y Next precarga
// sus chunks en las rutas que SÍ lo montan; en `/portal/**` no se renderiza, y
// ni se precarga ni se descarga. Tiene que ser un componente de cliente: desde
// un Server Component `dynamic` no divide el código.
//
// Lo vigila `e2e/student-sin-codigo-del-panel.spec.ts`, mirando el JS que la
// pantalla descarga de verdad.
const ProveedoresSesion = dynamic(() => import('./proveedores-sesion'));

export function ProveedoresRaiz({ children }: { children: ReactNode }) {
  if (esAppDeLaAlumna(usePathname())) return <>{children}</>;
  return <ProveedoresSesion>{children}</ProveedoresSesion>;
}
