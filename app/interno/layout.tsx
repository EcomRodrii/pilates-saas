'use client';

// Chrome del panel interno. Deliberadamente MUY distinto del panel de un
// estudio (barra oscura, marca "Tentare Internal"): mirando media pantalla
// tienes que saber si estás en tu backoffice o dentro del negocio de un
// cliente. Confundirlos es como se cometen los errores caros.
//
// La guardia de aquí es de USABILIDAD, no de seguridad: decide qué se pinta.
// Quien autoriza de verdad es cada ruta de /api/interno, que vuelve a
// comprobar permisos con el JWT. Un cliente manipulado no consigue nada.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, CreditCard, LayoutDashboard, ScrollText, ShieldAlert, Users } from 'lucide-react';
import { fetchSesionInterna, SinAcceso, type SesionInterna } from '@/lib/interno/client';
import { useAuth } from '@/lib/auth-context';
import { tieneAlguno, type Permiso } from '@/lib/interno/permisos';

const Ctx = createContext<SesionInterna | null>(null);
export const useSesionInterna = (): SesionInterna => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSesionInterna fuera del layout de /interno');
  return s;
};

const SECCIONES: Array<{ href: string; etiqueta: string; icono: typeof Building2; permisos: Permiso[] }> = [
  { href: '/interno', etiqueta: 'Resumen', icono: LayoutDashboard, permisos: ['studios.read'] },
  { href: '/interno/estudios', etiqueta: 'Estudios', icono: Building2, permisos: ['studios.read'] },
  { href: '/interno/facturacion', etiqueta: 'Facturación', icono: CreditCard, permisos: ['billing.read'] },
  { href: '/interno/auditoria', etiqueta: 'Auditoría', icono: ScrollText, permisos: ['logs.read'] },
  { href: '/interno/equipo', etiqueta: 'Equipo', icono: Users, permisos: ['users.create', 'users.delete'] },
];

export default function LayoutInterno({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [sesion, setSesion] = useState<SesionInterna | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const pathname = usePathname();

  const cargar = useCallback(async () => {
    try {
      setSesion(await fetchSesionInterna());
    } catch (e) {
      setError(e instanceof SinAcceso ? e.message : 'No se ha podido comprobar tu acceso.');
    } finally {
      setCargando(false);
    }
  }, []);

  // setState tras await, no en cascada — falso positivo del lint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Comprobando acceso…</div>;
  }

  if (!sesion) {
    // Dos situaciones muy distintas que antes se contaban igual, y la segunda
    // dejaba sin salida: estar dentro con la cuenta equivocada. La identidad de
    // empresa y la de cliente son cuentas separadas a propósito, así que hay que
    // decir CON CUÁL estás y ofrecer el cambio.
    const conCuentaAjena = Boolean(user);
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="max-w-sm text-center flex flex-col items-center gap-3">
          <span className="w-11 h-11 rounded-full bg-amber-500/10 text-warning grid place-items-center">
            <ShieldAlert size={20} />
          </span>
          <h1 className="text-[17px] font-bold text-foreground">Zona interna de Tentare</h1>
          {conCuentaAjena ? (
            <>
              <p className="text-[13.5px] text-muted-foreground">
                Has entrado como <strong className="text-foreground">{user?.email}</strong>, que no es una cuenta
                del equipo de Tentare. Entra con tu cuenta de empresa.
              </p>
              <button
                type="button"
                onClick={() => { void signOut().then(() => { window.location.href = '/login?destino=/interno'; }); }}
                className="mt-1 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
                Cambiar de cuenta
              </button>
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-muted-foreground">{error}</p>
              <Link href="/login?destino=/interno" className="mt-1 px-3.5 py-2 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold">
                Iniciar sesión
              </Link>
            </>
          )}
          <Link href="/" className="text-[12.5px] font-semibold text-muted-foreground">Volver a Tentare</Link>
        </div>
      </div>
    );
  }

  const visibles = SECCIONES.filter(s => tieneAlguno(sesion.permisos, s.permisos));

  return (
    <Ctx.Provider value={sesion}>
      <div className="min-h-screen bg-background">
        <header className="bg-slate-900 text-slate-100">
          <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-4">
            <span className="text-[13px] font-bold tracking-wide">Tentare <span className="text-slate-400 font-medium">Internal</span></span>
            <nav className="flex items-center gap-1 flex-1">
              {visibles.map(s => {
                const activo = s.href === '/interno' ? pathname === s.href : pathname.startsWith(s.href);
                const Icono = s.icono;
                return (
                  <Link key={s.href} href={s.href}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 transition-colors ${
                      activo ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <Icono size={14} />{s.etiqueta}
                  </Link>
                );
              })}
            </nav>
            <span className="text-right leading-tight">
              <span className="block text-[12.5px] font-semibold">{sesion.nombre}</span>
              {sesion.cargo && <span className="block text-[11px] text-slate-400">{sesion.cargo}</span>}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
