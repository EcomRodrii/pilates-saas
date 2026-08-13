'use client';

// Landing pública de Tentare Network — alta INDEPENDIENTE, sin ningún
// estudio Tentare detrás (a diferencia de app/instructora/alta, que crea un
// estudio de un solo miembro; son dos conceptos de negocio distintos, no
// reutilizar ese flujo aquí aunque el copy se parezca).
//
// Antes era un formulario con una línea de copy encima — ni explicaba qué
// es Network ni por qué a una instructora le compensa rellenarlo. Ahora es
// una landing real, con el mismo lenguaje visual que la principal (app/
// page.tsx): nav cápsula, hero a foto completa, secciones con Reveal,
// FAQ, CTA final oscuro — pero con SU narrativa (visibilidad para quien
// busca trabajo, no control operativo para quien dirige un estudio).
//
// app/network/layout.tsx no pinta su cabecera propia en esta ruta (mira su
// propio comentario): esta página trae su nav entero, y dos cabeceras
// apiladas se verían como un error de maquetación.
//
// Sin metadata `pending_*` ni paso por /login: PUT /api/network/perfil ya
// funciona con solo un JWT válido (verificarUsuarioSupabase, sin studio_id),
// así que al confirmar el email basta con aterrizar en /network/mi-perfil y
// dejar que la persona rellene su perfil ella misma — no hay nada que crear
// automáticamente a partir de la metadata del signup.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { GlobalStyles } from '@/components/landing/GlobalStyles';
import { SeccionHeroNetwork } from '@/components/landing/network/SeccionHeroNetwork';
import { SeccionProblema } from '@/components/landing/network/SeccionProblema';
import { SeccionComoFunciona } from '@/components/landing/network/SeccionComoFunciona';
import { SeccionConfianza } from '@/components/landing/network/SeccionConfianza';
import { SeccionParaEstudios } from '@/components/landing/network/SeccionParaEstudios';
import { SeccionFaqNetwork } from '@/components/landing/network/SeccionFaqNetwork';
import { SeccionRegistro } from '@/components/landing/network/SeccionRegistro';
import { SeccionPieNetwork } from '@/components/landing/network/SeccionPieNetwork';

export default function UnirseNetworkPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Ya tiene sesión (staff de un estudio, u otra pestaña ya registrada) — a
  // su perfil, no a pedirle que lea la landing otra vez. Misma fila
  // red_perfiles por auth_user_id si algún día también es staff.
  useEffect(() => {
    if (!loading && user) router.replace('/network/mi-perfil');
  }, [loading, user, router]);

  if (loading || user) return null;

  return (
    <div style={{ background: '#fff', color: '#1A1A1A', overflowX: 'clip' }}>
      <div style={{ position: 'relative' }}>
        <SeccionHeroNetwork />
        <SeccionProblema />
        <SeccionComoFunciona />
        <SeccionConfianza />
        <SeccionParaEstudios />
        <SeccionFaqNetwork />
      </div>
      <SeccionRegistro />
      <SeccionPieNetwork />
      <GlobalStyles />
    </div>
  );
}
