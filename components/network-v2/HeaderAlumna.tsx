'use client';

// Cabecera mínima del autoservicio de ALUMNA en Tentare Network — mismo
// logo que el resto de /network, pero sin la subnav de la instructora
// (Oportunidades/Mis candidaturas/Mensajes/Solicitudes: NetworkLayout,
// app/network/layout.tsx, no aplica aquí porque esas rutas no están en su
// SUBNAV). Hoy solo hay una pantalla propia (Inicio) además de Reanudar, así
// que no hace falta una barra de pestañas — el día que haya más ("Mis
// favoritos", p.ej.), es el sitio pensado para añadirlas.
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { InsigniaBeta } from './InsigniaBeta';
import { useAuth } from '@/lib/auth-context';

export function HeaderAlumna() {
  const { user, signOut } = useAuth();

  return (
    <header className="border-b border-[#E7E7E0] bg-white">
      <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/network/alumna/inicio" className="flex items-center gap-2.5">
          <LogoTentare formato="horizontal" producto="network" titulo="Tentare Network" alto={26} />
          <InsigniaBeta alto={26} />
        </Link>
        {user && (
          <button
            onClick={() => signOut()}
            className="text-[12px] text-[#8E8E86] hover:text-[#3A3A34] transition-colors"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
  );
}
