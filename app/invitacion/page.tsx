'use client';

// Pantalla de invitación al equipo.
//
// Existe porque el correo llevaba un `/login` pelado: quien lo abría con otra
// sesión iniciada acababa en SU panel sin enterarse de que le habían invitado, y
// quien se registraba con otro correo se creaba una cuenta suelta que no
// quedaba vinculada a nada. Aquí se dice quién invita y a qué estudio, y sobre
// todo se GUARDA el token: es él, y no el correo que se teclee después, lo que
// vincula la ficha (app/api/equipo/reclamar).

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { recordarTokenInvitacion } from '@/lib/equipo/invitacion-pendiente';

interface Invitacion {
  yaVinculada: boolean;
  nombre?: string;
  email?: string | null;
  estudio: string;
}

export default function PaginaInvitacion() {
  const { user, signOut } = useAuth();
  const [inv, setInv] = useState<Invitacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) { setError('Falta el enlace de invitación.'); return; }
    // Se guarda ANTES de saber si la invitación es válida: el alta ocurre en
    // otra pantalla, y sin esto el token se pierde al salir de aquí. Es lo que
    // permite vincular la ficha aunque la persona se registre con un correo
    // distinto al que la dueña le puso.
    recordarTokenInvitacion(token);
    try {
      const res = await fetch(`/api/public/invitacion?token=${encodeURIComponent(token)}`);
      const cuerpo = await res.json();
      if (!res.ok) { setError(cuerpo.error ?? 'No hemos podido abrir la invitación.'); return; }
      setInv(cuerpo as Invitacion);
    } catch {
      setError('No hemos podido abrir la invitación. Inténtalo en unos segundos.');
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  async function continuar() {
    // Si hay otra sesión abierta (el caso que rompía el flujo), se cierra antes
    // de mandar al alta: si no, el login rebota al panel de esa otra persona.
    if (user) await signOut();
    window.location.href = '/login?destino=/dashboard&alta=1';
  }

  const caja = 'w-full max-w-sm rounded-2xl border border-border bg-card px-6 py-7 text-center flex flex-col gap-3';

  if (error) {
    return (
      <main className="min-h-dvh grid place-items-center px-6">
        <div className={caja}>
          <h1 className="text-[17px] font-bold text-foreground">Invitación no disponible</h1>
          <p className="text-[13.5px] text-muted-foreground">{error}</p>
          <p className="text-[12.5px] text-muted-foreground">Pídele a tu estudio que te la envíe de nuevo.</p>
        </div>
      </main>
    );
  }

  if (!inv) {
    return (
      <main className="min-h-dvh grid place-items-center px-6">
        <p className="text-[13.5px] text-muted-foreground">Abriendo tu invitación…</p>
      </main>
    );
  }

  if (inv.yaVinculada) {
    return (
      <main className="min-h-dvh grid place-items-center px-6">
        <div className={caja}>
          <h1 className="text-[17px] font-bold text-foreground">Ya tienes cuenta</h1>
          <p className="text-[13.5px] text-muted-foreground">
            Tu cuenta de <strong className="text-foreground">{inv.estudio}</strong> ya está activa. Entra normalmente.
          </p>
          <a href="/login" className="mt-1 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13.5px] font-bold">
            Iniciar sesión
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className={caja}>
        <p className="text-[12px] font-bold uppercase tracking-wide text-brand-medio">Invitación</p>
        <h1 className="text-[19px] font-bold text-foreground leading-tight">
          {inv.nombre}, te han dado de alta en {inv.estudio}
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          Crea tu contraseña y tendrás acceso a tu horario, tus clases y los avisos del estudio.
        </p>

        {inv.email && (
          <div className="rounded-xl bg-accent px-3.5 py-2.5 text-left">
            <p className="text-[11.5px] text-muted-foreground">Tu estudio te tiene apuntada como:</p>
            <p className="text-[13.5px] font-bold text-foreground break-all">{inv.email}</p>
            {/* Antes esto decía "regístrate con este email EXACTO, con otro no
                quedarás vinculada". Era verdad cuando el enlace se resolvía por
                coincidencia de correo, y ya no lo es: ahora vincula el propio
                enlace. Mantener el aviso solo asustaba a quien prefiere entrar
                con otra cuenta. */}
            <p className="text-[11.5px] text-muted-foreground mt-1">
              Puedes crear tu cuenta con este correo o con otro: este enlace te vincula igual.
            </p>
          </div>
        )}

        {user && (
          <p className="text-[12.5px] text-warning">
            Ahora mismo hay otra sesión abierta ({user.email}). Se cerrará al continuar.
          </p>
        )}

        <button
          type="button" onClick={continuar}
          className="mt-1 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13.5px] font-bold"
        >
          {user ? 'Cerrar sesión y crear mi cuenta' : 'Crear mi cuenta'}
        </button>
      </div>
    </main>
  );
}
