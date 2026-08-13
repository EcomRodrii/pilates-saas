import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_TINTA, NW_MUTED_2 } from './tokens';

// Pie "slim" — README 1a: logo tinta 116px, links, "Parte del ecosistema
// Tentare". Server Component, sin estado.
export function PieNetwork() {
  return (
    <footer style={{ borderTop: '1px solid #E5E3DA' }} className="mt-20">
      <div className="max-w-[1240px] mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={20} decorativo />
        <nav className="flex items-center gap-5 flex-wrap justify-center" style={{ color: NW_MUTED_2 }}>
          <Link href="/network/instructoras" className="text-[13px] font-medium hover:opacity-70">Explorar instructoras</Link>
          <Link href="/network/acceso" className="text-[13px] font-medium hover:opacity-70">Acceso</Link>
          <Link href="/legal" className="text-[13px] font-medium hover:opacity-70">Aviso legal</Link>
          <Link href="/privacidad" className="text-[13px] font-medium hover:opacity-70">Privacidad</Link>
        </nav>
        <p className="text-[12.5px] font-medium" style={{ color: NW_TINTA }}>Parte del ecosistema Tentare</p>
      </div>
    </footer>
  );
}
