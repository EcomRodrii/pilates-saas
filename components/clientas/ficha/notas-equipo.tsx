'use client';

import { useState } from 'react';
import { Bot, Lock, Pin, PinOff, StickyNote, Trash2, Pencil, Users } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn, hoyEnEstudio } from '@/lib/utils';
import { fechaCorta } from '@/lib/clientas/textos';
import {
  nombreAutora, notaVisiblePara, puedeBorrarNota, puedeEditarNota, textoVisibilidad, type VisibilidadNota,
} from '@/lib/clientas/notas';
import { TarjetaFicha } from '@/components/clientas/piezas';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { NotaInterna, Rol } from '@/lib/types';

// «Notas del equipo»: lo que el mostrador sabe de ella y no cabe en un campo
// («prefiere que no la corrijan delante de otras», «viene con su hermana»).
// Cada nota dice quién la escribió y para quién es; las fijadas suben a la
// cabecera de su ficha, que es lo primero que se lee antes de atenderla.
//
// Lo que no deja la base de datos (RLS de `notas_internas`) tampoco se ofrece
// aquí: editar es de la autora, borrar de la autora o la propietaria.

const MAX_VISIBLES = 5;

export interface ContextoAutoras {
  uid: string | null;
  ownerUid: string | null;
  equipo: readonly { authUserId: string | null; nombre: string; rol: Rol }[];
}

export function NotasDelEquipo({ socioId, notas, rol, autoras, hoyISO, ella = 'ella', onToast }: {
  socioId: string;
  /** «ella» / «él». */
  ella?: string;
  /** Las suyas (ya filtradas por clienta). */
  notas: readonly NotaInterna[];
  rol: Rol;
  autoras: ContextoAutoras;
  hoyISO: string;
  onToast: (texto: string) => void;
}) {
  const { addNota, updateNota, deleteNota } = useStudio();
  const [texto, setTexto] = useState('');
  const [visibilidad, setVisibilidad] = useState<VisibilidadNota>('EQUIPO');
  const [guardando, setGuardando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [todas, setTodas] = useState(false);
  const [borrando, setBorrando] = useState<NotaInterna | null>(null);

  const visibles = notas
    .filter(n => notaVisiblePara(n, rol, autoras.uid))
    // Fijadas arriba; dentro de cada grupo, la más reciente primero.
    .sort((a, b) => Number(b.fijada) - Number(a.fijada) || b.creadoEn.localeCompare(a.creadoEn));
  const mostradas = todas ? visibles : visibles.slice(0, MAX_VISIBLES);

  async function guardar() {
    const limpio = texto.trim();
    if (!limpio || guardando) return;
    setGuardando(true);
    const res = await addNota(socioId, limpio, { visibilidad });
    setGuardando(false);
    if (!res.ok) { onToast(res.error); return; }
    setTexto('');
  }

  /** `true` solo si la base de datos devolvió la nota cambiada. */
  async function cambiar(nota: NotaInterna, cambios: Partial<Pick<NotaInterna, 'texto' | 'visibilidad' | 'fijada'>>, hecho?: string): Promise<boolean> {
    if (ocupada) return false;
    setOcupada(nota.id);
    const res = await updateNota(nota.id, cambios);
    setOcupada(null);
    if (!res.ok) { onToast(res.error); return false; }
    if (hecho) onToast(hecho);
    return true;
  }

  async function borrar(nota: NotaInterna) {
    if (ocupada) return;
    setOcupada(nota.id);
    const res = await deleteNota(nota.id);
    setOcupada(null);
    setBorrando(null);
    onToast(res.ok ? 'Nota borrada' : res.error);
  }

  async function guardarEdicion() {
    if (!editando) return;
    const nota = notas.find(n => n.id === editando.id);
    const limpio = editando.texto.trim();
    if (!nota || !limpio) return;
    // Si no se guarda, lo escrito sigue en el cuadro: no se pierde.
    if (await cambiar(nota, { texto: limpio }, 'Nota cambiada')) setEditando(null);
  }

  return (
    <TarjetaFicha titulo="Notas del equipo" icono={<StickyNote size={16} />}>
      <div className="rounded-xl border border-input bg-card transition-colors focus-within:border-foreground">
        <textarea
          rows={2}
          value={texto}
          onChange={e => setTexto(e.target.value.slice(0, 4000))}
          placeholder="Escribe una nota…"
          aria-label={`Nueva nota sobre ${ella}`}
          className="w-full resize-none bg-transparent px-3.5 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none [@media(pointer:fine)]:text-[13.5px]"
        />
        {texto.trim() && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2.5 py-2">
            <div role="radiogroup" aria-label="Quién la lee" className="inline-flex rounded-full bg-muted p-0.5">
              {(['EQUIPO', 'PRIVADA'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visibilidad === v}
                  onClick={() => setVisibilidad(v)}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition-colors',
                    visibilidad === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {v === 'EQUIPO' ? <Users size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
                  {textoVisibilidad(v, rol)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={guardando}
              className="min-h-9 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground text-pretty">
        Lesiones y salud, en su pestaña Salud{visibilidad === 'EQUIPO' ? ': esto lo lee todo el equipo.' : '.'}
      </p>

      {visibles.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">Nadie ha escrito nada sobre {ella} todavía.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {mostradas.map(nota => {
            const autora = nombreAutora(nota.autorUid, autoras);
            const editable = nota.tipo === 'NOTA' && puedeEditarNota(nota, rol, autoras.uid);
            const borrable = puedeBorrarNota(nota, rol, autoras.uid);
            const dia = hoyEnEstudio(new Date(nota.creadoEn));
            if (editando?.id === nota.id) {
              return (
                <li key={nota.id} className="py-2.5">
                  <textarea
                    rows={3}
                    autoFocus
                    value={editando.texto}
                    onChange={e => setEditando({ id: nota.id, texto: e.target.value.slice(0, 4000) })}
                    aria-label="Editar la nota"
                    className="w-full resize-none rounded-xl border border-input bg-card px-3 py-2 text-base text-foreground focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:fine)]:text-[13.5px]"
                  />
                  <div className="mt-1.5 flex justify-end gap-1.5">
                    <button type="button" onClick={() => setEditando(null)} className="min-h-9 rounded-xl px-3 text-[13px] font-semibold text-muted-foreground hover:bg-muted">Cancelar</button>
                    <button type="button" onClick={() => void guardarEdicion()} disabled={ocupada === nota.id || !editando.texto.trim()} className="min-h-9 rounded-xl bg-primary px-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-60">
                      {ocupada === nota.id ? 'Guardando…' : 'Guardar'}
                    </button>
                  </div>
                </li>
              );
            }
            return (
              <li key={nota.id} className="group py-2.5">
                <div className="flex items-start gap-2">
                  {nota.fijada
                    ? <Pin size={14} className="mt-1 shrink-0 text-brand" aria-label="Fijada" />
                    : nota.tipo === 'SISTEMA' ? <Bot size={14} className="mt-1 shrink-0 text-muted-foreground" aria-hidden /> : null}
                  <p className={cn('min-w-0 flex-1 whitespace-pre-line text-[13.5px] text-pretty', nota.tipo === 'SISTEMA' ? 'text-muted-foreground' : 'text-foreground', nota.fijada && 'font-medium')}>
                    {nota.texto}
                  </p>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
                  <span>
                    {[nota.tipo === 'SISTEMA' ? 'Automática' : autora, fechaCorta(dia, hoyISO), nota.editadaEn ? 'editada' : null].filter(Boolean).join(' · ')}
                  </span>
                  {nota.visibilidad === 'PRIVADA' && nota.tipo === 'NOTA' && (
                    <span className="inline-flex items-center gap-1" title={textoVisibilidad('PRIVADA', rol)}><Lock size={11} aria-hidden />privada</span>
                  )}
                  {(editable || borrable) && (
                    <span className="ml-auto flex items-center gap-0.5">
                      {editable && (
                        <BotonNota
                          etiqueta={nota.fijada ? 'Quitar de arriba' : 'Fijar arriba'}
                          icono={nota.fijada ? PinOff : Pin}
                          onClick={() => void cambiar(nota, { fijada: !nota.fijada }, nota.fijada ? 'Ya no está fijada' : 'Fijada arriba de su ficha')}
                          disabled={ocupada === nota.id}
                        />
                      )}
                      {editable && (
                        <BotonNota
                          etiqueta={nota.visibilidad === 'EQUIPO' ? 'Hacerla privada' : 'Para todo el equipo'}
                          icono={nota.visibilidad === 'EQUIPO' ? Lock : Users}
                          onClick={() => void cambiar(nota, { visibilidad: nota.visibilidad === 'EQUIPO' ? 'PRIVADA' : 'EQUIPO' }, nota.visibilidad === 'EQUIPO' ? 'Ahora es privada' : 'Ahora la lee todo el equipo')}
                          disabled={ocupada === nota.id}
                        />
                      )}
                      {editable && <BotonNota etiqueta="Editar" icono={Pencil} onClick={() => setEditando({ id: nota.id, texto: nota.texto })} disabled={ocupada === nota.id} />}
                      {borrable && <BotonNota etiqueta="Borrar" icono={Trash2} onClick={() => setBorrando(nota)} disabled={ocupada === nota.id} peligro />}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {visibles.length > MAX_VISIBLES && (
        <button type="button" onClick={() => setTodas(v => !v)} className="mt-1 w-full rounded-lg py-2 text-[13px] font-semibold text-foreground hover:bg-muted">
          {todas ? 'Ver menos' : `Ver las ${visibles.length} notas`}
        </button>
      )}
      <ConfirmDialog
        open={borrando !== null}
        onOpenChange={o => { if (!o && !ocupada) setBorrando(null); }}
        titulo="¿Borrar esta nota?"
        descripcion="Deja de verla todo el equipo, y no se puede deshacer."
        textoConfirmar={ocupada ? 'Borrando…' : 'Borrar'}
        destructivo
        onConfirm={() => { if (borrando) void borrar(borrando); }}
      />
    </TarjetaFicha>
  );
}

function BotonNota({ etiqueta, icono: Icono, onClick, disabled, peligro }: {
  etiqueta: string;
  icono: typeof Pin;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-40 [@media(pointer:fine)]:size-7',
        peligro ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground',
      )}
    >
      <Icono size={13} aria-hidden />
    </button>
  );
}
