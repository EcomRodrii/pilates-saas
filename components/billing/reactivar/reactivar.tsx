'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { estadoBilling, registrarVisitaPlanes, type EstadoBilling } from '@/lib/api-client';
import { PLAN_INFO } from '@/lib/billing/entitlements';
import { decidirReactivacion, RUTA_TODOS_LOS_PLANES } from '@/lib/billing/reactivar';
import { PagoReactivar } from './pago-reactivar';
import estilos from './reactivar.module.css';

/**
 * La pantalla a la que llega un estudio al que se le ha acabado el plazo, con la
 * forma de la de Shopify (/access_account/reactivate, medida el 26-nov-2026): una
 * tarjeta partida, a la izquierda qué se contrata y a la derecha se paga sin salir.
 * Precios y condiciones son los de Tentare: nada de ofertas que no existen.
 */
const TEXTOS = {
  BASE: ['Sin límite de alumnas ni de reservas.', 'Sigue justo donde lo dejaste.'],
  ESTUDIO: ['Centro de Control, sustituciones e IA incluidos.', 'Sigue justo donde lo dejaste.'],
} as const;

export function Reactivar({ estudio }: { estudio: string }) {
  const { session, loading, signOut } = useAuth();
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoBilling | null | undefined>(undefined);

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!session) return;
    let vivo = true;
    void estadoBilling().then(e => { if (vivo) setEstado(e); });
    return () => { vivo = false; };
  }, [session]);

  const decision = estado === undefined ? null : decidirReactivacion(estado, estudio);
  const destino = decision?.accion === 'ir' ? decision.a : null;
  const plan = decision?.accion === 'pagar' ? decision.plan : null;

  useEffect(() => { if (destino) router.replace(destino); }, [destino, router]);

  const visitaApuntada = useRef(false);
  useEffect(() => {
    if (!plan || visitaApuntada.current) return;
    visitaApuntada.current = true;
    void registrarVisitaPlanes();
  }, [plan]);

  const email = session?.user.email ?? '';
  // Los complementos van aparte solo si Founding se vende así (los tres con precio).
  const complementosAparte = plan === 'BASE' && (estado?.complementos?.disponibles.length ?? 0) >= 3;

  return (
    <main className={estilos.fondo} data-reactivar>
      {session && <MenuCuenta email={email} onSalir={signOut} />}
      {!plan || !session ? (
        <div className={estilos.espera} role="status" aria-label="Cargando"><span className={estilos.barra} /></div>
      ) : (
        <>
          <div className={estilos.tarjeta}>
            <section className={estilos.izquierda}>
              <div className={estilos.contenido}>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen fija, ya en su tamaño y formato */}
                <img src="/marcas/moneda-tentare.webp" alt="" width={126} height={126} className={estilos.moneda} />
                <h1 className={estilos.titulo}>Retoma tu estudio por {PLAN_INFO[plan].precioMes}&nbsp;€</h1>
                <p className={estilos.frase}>
                  {TEXTOS[plan].map(linea => <span key={linea}>{linea}</span>)}
                </p>
                <ul className={estilos.pildoras}>
                  <li className={estilos.pildora}>{PLAN_INFO[plan].nombre} · IVA incluido</li>
                  <li className={estilos.pildora}>Sin permanencia</li>
                </ul>
              </div>
              <Link href={RUTA_TODOS_LOS_PLANES} className={estilos.planes}>Ver todos los planes</Link>
            </section>
            <section className={estilos.panel} aria-label="Pago">
              <PagoReactivar plan={plan} email={email} complementosAparte={complementosAparte} />
            </section>
          </div>
          <p className={estilos.pie}>
            Los datos de tu estudio siguen guardados. <Link href="/suscripcion#exportar-datos">Descargarlos</Link>
          </p>
        </>
      )}
    </main>
  );
}

function MenuCuenta({ email, onSalir }: { email: string; onSalir: () => Promise<void> }) {
  const { studio } = useStudio();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const iniciales = (studio?.nombre || email || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', cerrar);
    return () => window.removeEventListener('keydown', cerrar);
  }, [abierto]);

  return (
    <div className={estilos.cuenta}>
      <button type="button" className={estilos.avatar} aria-label="Tu cuenta" aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
        {iniciales}
      </button>
      {abierto && (
        <div className={estilos.menu}>
          <p>{studio?.nombre}<span>{email}</span></p>
          <Link href="/suscripcion#exportar-datos">Descargar mis datos</Link>
          <a href="mailto:soporte@tentare.app">Escribir a soporte</a>
          <button type="button" onClick={() => { void onSalir().then(() => router.replace('/login')); }}>Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
