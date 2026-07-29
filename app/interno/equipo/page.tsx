'use client';

// Quién tiene acceso al backoffice de Tentare.
//
// Hasta ahora esto era SQL escrito a mano, así que en la práctica no se hacía:
// nadie revisa trimestralmente una tabla que solo se toca abriendo un editor de
// consultas. El objetivo de esta pantalla no es solo dar de alta — es que
// **mirarla incomode**: quién sigue entrando, quién no entra desde hace meses,
// y quién puede tocar el dinero.
//
// Las reglas de qué se puede conceder están en `lib/interno/equipo-reglas.ts` y
// se aplican otra vez en la API. Aquí se usan para desactivar casillas y
// explicar POR QUÉ están desactivadas, que es la parte que la API no puede
// hacer.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, ShieldCheck, UserPlus, X } from 'lucide-react';
import {
  altaEnEquipo, cambiarMiembro, fetchEquipo, type MiembroEquipo,
} from '@/lib/interno/client';
import {
  PERMISOS_PELIGROSOS, PERMISOS_POR_AREA, PERMISOS_SOLO_CEO, PERMISO_ETIQUETA,
  PRESETS, tienePermiso, type Permiso,
} from '@/lib/interno/permisos';
import { useSesionInterna } from '../layout';

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

function diasSin(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Por qué NO puedes conceder este permiso, o null si sí puedes. Es el mismo
 * criterio que aplica la API (`puedeConceder`), pero aquí hace falta el texto:
 * una casilla en gris sin explicación se lee como un fallo de la aplicación.
 */
function vetoDe(mis: readonly string[], p: Permiso): string | null {
  if (!tienePermiso(mis, p)) return 'No puedes conceder un permiso que tú no tienes.';
  if (PERMISOS_SOLO_CEO.includes(p) && !mis.includes('admin.full')) {
    return 'Este permiso no se delega: solo lo concede quien tiene acceso total.';
  }
  return null;
}

function Casillas({ mis, valor, onChange, deshabilitado }: {
  mis: readonly string[];
  valor: string[];
  onChange: (v: string[]) => void;
  deshabilitado?: boolean;
}) {
  const alternar = (p: Permiso) =>
    onChange(valor.includes(p) ? valor.filter(x => x !== p) : [...valor, p]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PERMISOS_POR_AREA.map(({ area, permisos }) => (
        <div key={area}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{area}</p>
          <div className="flex flex-col gap-1">
            {permisos.map(p => {
              const veto = vetoDe(mis, p);
              const marcado = valor.includes(p);
              const off = deshabilitado || (veto !== null && !marcado);
              return (
                <label
                  key={p} title={veto ?? undefined}
                  className={`flex items-start gap-2 text-[12.5px] leading-snug ${off ? 'opacity-45' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox" checked={marcado} disabled={off}
                    onChange={() => alternar(p)}
                    className="mt-0.5 size-3.5 shrink-0 accent-brand-medio"
                  />
                  <span className="text-foreground">
                    {PERMISO_ETIQUETA[p]}
                    {PERMISOS_PELIGROSOS.includes(p) && (
                      <AlertTriangle className="ml-1 inline size-3 text-amber-600" aria-label="Permiso delicado" />
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Presets({ mis, onElegir }: { mis: readonly string[]; onElegir: (p: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(PRESETS).map(([nombre, preset]) => {
        const off = preset.permisos.some(p => vetoDe(mis, p) !== null);
        return (
          <button
            key={nombre} type="button" disabled={off}
            title={off ? 'Incluye permisos que tú no puedes conceder.' : preset.descripcion}
            onClick={() => onElegir([...preset.permisos])}
            className="rounded-lg border border-border px-2.5 py-1 text-[12px] font-semibold text-foreground disabled:opacity-40"
          >
            {nombre}
          </button>
        );
      })}
    </div>
  );
}

function Ficha({ m, mis, soyYo, onGuardado }: {
  m: MiembroEquipo; mis: readonly string[]; soyYo: boolean; onGuardado: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [permisos, setPermisos] = useState<string[]>(m.permisos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dias = diasSin(m.ultimoAcceso);
  const cambiado = useMemo(
    () => JSON.stringify([...permisos].sort()) !== JSON.stringify([...m.permisos].sort()),
    [permisos, m.permisos],
  );

  const guardar = async (extra: { activo?: boolean } = {}) => {
    setGuardando(true); setError(null);
    try {
      await cambiarMiembro(m.userId, { permisos, ...extra });
      onGuardado();
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar.');
    } finally { setGuardando(false); }
  };

  return (
    <div
      data-testid={`miembro-${m.userId}`}
      className={`rounded-2xl border border-border bg-card px-4 py-3.5 ${m.activo ? '' : 'opacity-60'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-bold text-foreground">
            {m.nombre}
            {soyYo && <span className="ml-1.5 text-[11.5px] font-semibold text-muted-foreground">(tú)</span>}
            {m.permisos.includes('admin.full') && (
              <ShieldCheck className="ml-1.5 inline size-3.5 text-brand-medio" aria-label="Acceso total" />
            )}
          </p>
          <p className="text-[12.5px] text-muted-foreground">
            {m.cargo ? `${m.cargo} · ` : ''}{m.email ?? 'sin email'}
          </p>
        </div>
        <div className="text-right text-[11.5px] text-muted-foreground leading-snug">
          {!m.activo ? <span className="font-bold text-foreground">De baja</span>
            : dias === null ? 'No ha entrado nunca'
            : dias > 90 ? <span className="font-bold text-amber-700 dark:text-amber-400">Sin entrar hace {dias} días</span>
            : `Última entrada: ${fecha(m.ultimoAcceso)}`}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {m.permisos.length === 0 && <span className="text-[12px] text-muted-foreground">Sin permisos.</span>}
        {m.permisos.map(p => (
          <span
            key={p}
            className={`rounded-lg px-2 py-0.5 text-[11.5px] font-semibold ${
              PERMISOS_PELIGROSOS.includes(p as Permiso)
                ? 'bg-amber-500/12 text-amber-700 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'}`}
          >
            {PERMISO_ETIQUETA[p as Permiso] ?? p}
          </span>
        ))}
      </div>

      {/* Nadie se toca a sí mismo: ni para ascenderse ni para dejarse fuera.
          Se dice, en vez de esconder el botón y que parezca que falta algo. */}
      {soyYo ? (
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          No puedes cambiar tu propio acceso. Que te lo cambie otra persona del equipo.
        </p>
      ) : !abierto ? (
        <button
          type="button" onClick={() => { setPermisos(m.permisos); setAbierto(true); }}
          className="mt-2.5 rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
        >
          Cambiar acceso
        </button>
      ) : (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2"><Presets mis={mis} onElegir={setPermisos} /></div>
          <Casillas mis={mis} valor={permisos} onChange={setPermisos} deshabilitado={guardando} />
          {error && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button" disabled={guardando || (!cambiado && m.activo)}
              onClick={() => void guardar()}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[12.5px] font-bold text-brand-foreground disabled:opacity-40"
            >
              {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Guardar
            </button>
            <button
              type="button" onClick={() => setAbierto(false)} disabled={guardando}
              className="rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
            >
              Cancelar
            </button>
            <span className="flex-1" />
            {m.activo ? (
              <button
                type="button" disabled={guardando}
                onClick={() => void guardar({ activo: false })}
                className="rounded-xl border border-red-500/40 px-3 py-1.5 text-[12.5px] font-semibold text-red-700 dark:text-red-400"
              >
                Dar de baja
              </button>
            ) : (
              <button
                type="button" disabled={guardando}
                onClick={() => void guardar({ activo: true })}
                className="rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
              >
                Reactivar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Alta({ mis, onCreado }: { mis: readonly string[]; onCreado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [cargo, setCargo] = useState('');
  const [password, setPassword] = useState('');
  const [permisos, setPermisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Al crear la cuenta desde aquí hay que ENTREGAR las credenciales, así que la
  // pantalla no puede limpiarse y decir "hecho": tiene que enseñar qué mandar.
  const [entregar, setEntregar] = useState<{ email: string; password: string } | null>(null);

  const enviar = async () => {
    setGuardando(true); setError(null);
    try {
      const r = await altaEnEquipo({ email, nombre, cargo, password, permisos });
      const credenciales = r.cuentaCreada ? { email: email.trim().toLowerCase(), password } : null;
      setEmail(''); setNombre(''); setCargo(''); setPassword(''); setPermisos([]);
      setAbierto(false);
      setEntregar(credenciales);
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido dar de alta.');
    } finally { setGuardando(false); }
  };

  if (entregar) {
    return (
      <div data-testid="credenciales" className="rounded-2xl border border-brand-medio/40 bg-card px-4 py-3.5">
        <p className="text-[14px] font-bold text-foreground">Cuenta creada. Pásale estos datos.</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Esta contraseña no se puede volver a ver desde aquí: se guarda cifrada. Si se
          pierde, la persona entra con «He olvidado mi contraseña».
        </p>
        <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-muted-foreground">Entra en</dt>
          <dd className="font-mono text-foreground">tentare.app/login</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-mono text-foreground">{entregar.email}</dd>
          <dt className="text-muted-foreground">Contraseña</dt>
          <dd className="font-mono text-foreground">{entregar.password}</dd>
        </dl>
        <p className="mt-2.5 text-[12px] text-muted-foreground">
          Dile que la cambie en Configuración → Perfil en cuanto entre: mientras no lo
          haga, tú también conoces su contraseña y sus acciones no son del todo suyas.
        </p>
        <button
          type="button" onClick={() => setEntregar(null)}
          className="mt-3 rounded-xl border border-border px-3 py-1.5 text-[12.5px] font-semibold text-foreground"
        >
          Ya se los he pasado
        </button>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button" onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-foreground"
      >
        <UserPlus className="size-4" /> Añadir a alguien
      </button>
    );
  }

  const campo = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground';

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-foreground">Añadir a alguien al equipo</p>
        <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar">
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input className={campo} placeholder="Email" type="email" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="off" />
        <input className={campo} placeholder="Nombre" value={nombre}
          onChange={e => setNombre(e.target.value)} autoComplete="off" />
        <input className={campo} placeholder="Cargo (opcional)" value={cargo}
          onChange={e => setCargo(e.target.value)} autoComplete="off" />
      </div>

      <input
        className={`${campo} mt-2`} type="text" value={password}
        onChange={e => setPassword(e.target.value)} autoComplete="off"
        placeholder="Contraseña inicial (mínimo 8 caracteres)"
      />
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        Se le crea la cuenta con esa contraseña y le pasas los datos para que entre.
        Si ese email ya tiene cuenta en Tentare, se enlaza la suya y la contraseña
        se ignora.
      </p>

      <div className="mt-3"><Presets mis={mis} onElegir={setPermisos} /></div>
      <div className="mt-2"><Casillas mis={mis} valor={permisos} onChange={setPermisos} deshabilitado={guardando} /></div>

      {error && <p className="mt-2 text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button" disabled={guardando || !email || !nombre || permisos.length === 0}
        onClick={() => void enviar()}
        className="mt-3 flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-bold text-brand-foreground disabled:opacity-40"
      >
        {guardando ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
        Dar de alta
      </button>
    </div>
  );
}

export default function EquipoInterno() {
  const sesion = useSesionInterna();
  const [equipo, setEquipo] = useState<MiembroEquipo[] | null>(null);
  const [yo, setYo] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchEquipo();
      setEquipo(r.equipo); setYo(r.yo); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  if (error) return <p className="text-[13.5px] text-muted-foreground">{error}</p>;
  if (!equipo) return <p className="text-[13.5px] text-muted-foreground">Cargando…</p>;

  const activos = equipo.filter(m => m.activo);
  const bajas = equipo.filter(m => !m.activo);
  const conDinero = activos.filter(m =>
    m.permisos.some(p => p === 'admin.full' || p === 'billing.refund' || p === 'studios.update'));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-foreground">Equipo</h1>
          <p className="text-[12.5px] text-muted-foreground">
            {activos.length} persona(s) con acceso al backoffice
            {conDinero.length > 0 && `, ${conDinero.length} de ellas pueden tocar planes o dinero`}.
          </p>
        </div>
        <Alta mis={sesion.permisos} onCreado={() => void cargar()} />
      </div>

      <div className="flex flex-col gap-2.5">
        {activos.map(m => (
          <Ficha key={m.userId} m={m} mis={sesion.permisos} soyYo={m.userId === yo}
            onGuardado={() => void cargar()} />
        ))}
      </div>

      {bajas.length > 0 && (
        <section>
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">
            De baja
          </h2>
          <div className="flex flex-col gap-2.5">
            {bajas.map(m => (
              <Ficha key={m.userId} m={m} mis={sesion.permisos} soyYo={m.userId === yo}
                onGuardado={() => void cargar()} />
            ))}
          </div>
        </section>
      )}

      <p className="text-[11.5px] text-muted-foreground leading-snug">
        Dar de baja no borra nada: la persona deja de entrar y su rastro sigue en la
        auditoría. Todos los cambios de esta pantalla quedan registrados con quién los hizo.
      </p>
    </div>
  );
}
