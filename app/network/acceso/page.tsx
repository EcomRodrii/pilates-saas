'use client';

// Puerta de login de Tentare Network. EN MANTENIMIENTO desde el 29-sep-2026
// (decisión del fundador): mientras ACCESO_NETWORK_EN_MANTENIMIENTO esté a
// `true` se ve el aviso; el formulario real (email/contraseña, Google, OTP y
// resolución post-login) vive intacto en ./formulario-acceso.tsx. El resto de
// Network (marketplace público, perfiles publicados) sigue funcionando: solo
// esta puerta y la de alta (/network/crear-perfil) están cerradas.
import Link from 'next/link';
import { AvisoMantenimientoNetwork } from '@/components/network/aviso-mantenimiento';
import { ACCESO_NETWORK_EN_MANTENIMIENTO, MENSAJE_ACCESO_NETWORK_CERRADO } from '@/lib/network/mantenimiento';
import { FormularioAccesoNetwork } from './formulario-acceso';

export default function AccesoNetworkPage() {
  if (!ACCESO_NETWORK_EN_MANTENIMIENTO) return <FormularioAccesoNetwork />;
  return (
    <AvisoMantenimientoNetwork
      mensaje={MENSAJE_ACCESO_NETWORK_CERRADO}
      pieAdicional={<>¿Gestionas un estudio con Tentare Software? Esto no te afecta — <Link href="/login" className="font-bold underline">inicia sesión aquí</Link>.</>}
    />
  );
}
