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
import { AvisoMantenimientoNetwork } from '@/components/network/aviso-mantenimiento';

export default function AccesoNetworkPage() {
  return (
    <AvisoMantenimientoNetwork
      mensaje="El acceso a Tentare Network está temporalmente cerrado. Vuelve a intentarlo más tarde."
      pieAdicional={<>¿Gestionas un estudio con Tentare Software? Esto no te afecta — <Link href="/login" className="font-bold underline">inicia sesión aquí</Link>.</>}
    />
  );
}
