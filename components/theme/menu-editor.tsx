'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, RotateCcw, Check, AlertTriangle } from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { useStudio } from '@/lib/studio-context';
import { fetchLayout, guardarLayoutApi } from '@/lib/api-client';
import { MODULOS, NO_OCULTABLES, type NavItemDef } from '@/lib/nav-config';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

// El orden del menú NO se puede cambiar, a propósito: si cada estudio coloca
// las cosas a su manera, aprender una pantalla deja de servir para entender el
// resto, y ninguna captura ni instrucción vale para dos estudios distintos.
// Ocultar sí, porque quita ruido sin mover de sitio lo que queda.
function Fila({ item, oculto, onToggle }: { item: NavItemDef; oculto: boolean; onToggle: () => void }) {
  const noOcultable = NO_OCULTABLES.includes(item.href);
  const Icon = item.icon;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card">
      <Icon size={16} className={oculto ? 'text-muted-foreground/40' : 'text-foreground'} />
      <span className={`flex-1 text-[13px] font-medium ${oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
        {item.label}
      </span>
      <button
        onClick={onToggle}
        disabled={noOcultable}
        title={noOcultable ? 'Este módulo no se puede ocultar' : oculto ? 'Mostrar' : 'Ocultar'}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={oculto ? `Mostrar ${item.label}` : `Ocultar ${item.label}`}
      >
        {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function MenuEditor() {
  const { rol } = usePermisos();
  const { studio } = useStudio();
  // En una cadena el menú es único para todas las sedes (se guarda sobre la
  // cadena, no sobre la sede activa): el copy tiene que decirlo, porque antes
  // decía "todo el estudio" y una dueña de cadena lo leía como "toda la cadena".
  const enCadena = Boolean(studio?.cadenaId);
  const [items, setItems] = useState<string[]>(MODULOS.map((m) => m.href));
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);


  useEffect(() => {
    let vivo = true;
    fetchLayout()
      .then((l) => {
        if (!vivo) return;
        const todos = MODULOS.map((m) => m.href);
        const orden = [...l.orden.filter((h) => todos.includes(h)), ...todos.filter((h) => !l.orden.includes(h))];
        setItems(orden);
        setOcultos(new Set(l.ocultos));
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setEstado('listo');
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (rol !== 'PROPIETARIO') {
    return <p className="text-sm text-muted-foreground">Solo la propietaria del estudio puede configurar el menú.</p>;
  }
  if (estado === 'cargando') {
    return <p className="text-sm text-muted-foreground">Cargando el menú…</p>;
  }

  function toggle(href: string) {
    if (NO_OCULTABLES.includes(href)) return;
    setOcultos((prev) => {
      const n = new Set(prev);
      if (n.has(href)) n.delete(href);
      else n.add(href);
      return n;
    });
    setAviso(null);
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarLayoutApi({ orden: [], ocultos: [...ocultos] });
      window.dispatchEvent(new CustomEvent('tentare-layout-changed'));
      setAviso({ tipo: 'ok', texto: enCadena ? 'Menú guardado y aplicado a todas las sedes.' : 'Menú guardado y aplicado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setGuardando(false);
    }
  }

  function restaurar() {
    setItems(MODULOS.map((m) => m.href));
    setOcultos(new Set());
    setAviso(null);
  }

  const porHref = new Map(MODULOS.map((m) => [m.href, m]));

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-[13px] text-muted-foreground">
        Oculta los módulos que {enCadena ? 'tu cadena' : 'tu estudio'} no use. El orden es siempre el mismo para que cualquier persona del equipo se oriente igual.{' '}
        {enCadena ? 'Se aplica a todas las sedes de tu cadena.' : 'Se aplica a todo el estudio.'}
      </p>

      <div className="space-y-1.5">
        {items.map((href) => {
          const item = porHref.get(href);
          if (!item) return null;
          return <Fila key={href} item={item} oculto={ocultos.has(href)} onToggle={() => toggle(href)} />;
        })}
      </div>

      {aviso && (
        <div className={`flex items-center gap-2 text-[12.5px] font-medium ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-destructive'}`}>
          {aviso.tipo === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
          <span>{aviso.texto}</span>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <button onClick={restaurar} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-muted-foreground">
          <RotateCcw size={14} /> Restaurar
        </button>
        <div className="flex-1" />
        <button onClick={guardar} disabled={guardando} className="text-[13px] font-bold px-4 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar menú'}
        </button>
      </div>
    </div>
  );
}
