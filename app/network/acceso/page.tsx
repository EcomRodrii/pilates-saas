'use client';

// Puerta de login de Tentare Network EN MANTENIMIENTO (29-sep-2026, decisión
// del fundador). Sustituye temporalmente toda la lógica real (email/password,
// Google, OTP, resolución post-login) por un aviso — mismo patrón que ya usó
// el editor de apariencia (app/(dashboard)/configuracion/apariencia/page.tsx)
// cuando estuvo cerrado: contenido reemplazado, no oculto del menú (no es un
// "frozen feature", es reversible sin migración ni flag). El resto de
// Network (marketplace público, perfiles publicados) sigue funcionando: solo
// esta puerta y la de alta (/network/crear-perfil) están cerradas.
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_SAGE, NW_BORDE } from '@/components/network-v2/tokens';

export default function AccesoNetworkPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-8" style={{ background: NW_FONDO }}>
      <div className="max-w-[420px] w-full bg-white rounded-2xl p-8 text-center" style={{ border: `1px solid ${NW_BORDE}` }}>
        <Link href="/network" className="inline-flex mb-6">
          <LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={22} decorativo />
        </Link>
        <h1 className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>Estamos en mantenimiento</h1>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: NW_MUTED }}>
          El acceso a Tentare Network está temporalmente cerrado. Vuelve a intentarlo más tarde.
        </p>
        <div className="mt-6 rounded-xl p-4 text-[12.5px]" style={{ background: NW_SAGE, color: NW_TINTA }}>
          ¿Gestionas un estudio con Tentare Software? Esto no te afecta —{' '}
          <Link href="/login" className="font-bold underline">inicia sesión aquí</Link>.
        </div>
      </div>
    </div>
  );
}
