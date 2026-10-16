'use client';

// TEMPORAL — maquetas de los diálogos de Clientas. No se commitea.
import type { ReactNode } from 'react';
import { AlertTriangle, Camera, Check, Globe, MessageCircle, Phone, Store, Users, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Boton, Nota } from './comun';

function Dialogo({ titulo, sub, children, pie, ancho = 440 }: { titulo: string; sub?: string; children: ReactNode; pie: ReactNode; ancho?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl" style={{ width: ancho }}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className="text-[17px] font-semibold text-foreground">{titulo}</h3>
          {sub && <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{sub}</p>}
        </div>
        <X size={18} className="mt-1 shrink-0 text-muted-foreground" />
      </div>
      <div className="space-y-4 px-5 py-4">{children}</div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{pie}</div>
    </div>
  );
}

function Opciones({ items, activa, cols = 2 }: { items: string[]; activa: number; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn('grid gap-1.5', cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4')}>
      {items.map((x, i) => (
        <span key={x} className={cn('rounded-lg border px-2 py-2 text-center text-[13px] font-medium', i === activa ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-foreground')}>{x}</span>
      ))}
    </div>
  );
}

function L({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-foreground">{children}</p>;
}

export function DialogoContacto() {
  return (
    <div className="space-y-4">
      <div className="flex w-[440px] items-center gap-3 rounded-xl bg-sidebar px-4 py-3 text-[13px] text-sidebar-foreground shadow-lg">
        <MessageCircle size={16} className="shrink-0" />
        <span className="flex-1">Has vuelto de WhatsApp. ¿Le has escrito a Carmen?</span>
        <span className="rounded-md bg-sidebar-foreground px-2.5 py-1 text-[12.5px] font-medium text-sidebar">Sí, apuntar</span>
        <span className="text-[12.5px] text-sidebar-foreground/70">No</span>
      </div>
      <Dialogo
        titulo="Apuntar contacto con Carmen"
        sub="Queda en su historia con tu nombre. El Centro de Control lo tiene en cuenta y no te pedirá que le escribas otra vez."
        pie={<><Boton>Cancelar</Boton><Boton primario icono={Check}>Apuntar</Boton></>}
      >
        <div><L>Cómo</L><Opciones items={['WhatsApp', 'Llamada', 'En persona', 'Email']} activa={1} cols={4} /></div>
        <div><L>Qué pasó</L><Opciones items={['Va a volver', 'Se lo piensa', 'No contesta', 'No quiere seguir']} activa={0} /></div>
        <div>
          <L>Nota <span className="font-normal text-muted-foreground">(opcional)</span></L>
          <div className="min-h-14 rounded-lg border border-input px-3 py-2 text-[13px] text-foreground">Ha tenido mucho lío en el trabajo, vuelve la semana que viene.</div>
        </div>
        <div><L>¿Te lo recuerdo?</L><Opciones items={['No', 'En 3 días', 'El lunes', 'Otro día']} activa={2} cols={4} /></div>
      </Dialogo>
    </div>
  );
}

export function DialogoBaja() {
  return (
    <Dialogo
      titulo="Dar de baja a Carmen Del Río"
      sub="Se puede deshacer: sigue en tu lista como «De baja» y la vuelves a dar de alta cuando quieras."
      pie={<><Boton>Cancelar</Boton><Boton primario>Dar de baja</Boton></>}
    >
      <div><L>Por qué se va</L><Opciones items={['Se muda', 'Lesión o salud', 'Precio', 'Horarios', 'No le convenció', 'Otro']} activa={3} cols={3} /></div>
      <div className="rounded-xl bg-muted/70 p-3.5">
        <L>Qué pasa ahora <Nota n={5} /></L>
        <ul className="space-y-1.5 text-[13px] text-foreground">
          <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-success" /><span>Su cuota <strong className="font-semibold">deja de renovarse</strong>: no se le cobra el 12 de octubre.</span></li>
          <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-success" /><span>Sus <strong className="font-semibold">2 reservas</strong> (jue 2 y mar 7) se cancelan y las plazas quedan libres.</span></li>
          <li className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-success" /><span>Lo que ya pagó no se devuelve. Deja de recibir campañas y avisos.</span></li>
        </ul>
      </div>
      <p className="text-[12.5px] text-muted-foreground">¿Lo que quieres es borrar sus datos? Eso es otra cosa: <span className="font-medium text-foreground underline underline-offset-2">Borrar sus datos</span>, en el menú de su ficha.</p>
    </Dialogo>
  );
}

export function DialogoBorrar() {
  return (
    <Dialogo
      titulo="Borrar los datos de Carmen Del Río"
      sub="Para cuando una clienta te pide que borres sus datos (RGPD)."
      pie={<><Boton>Cancelar</Boton><Boton className="border-transparent bg-destructive text-destructive-foreground">Borrar para siempre</Boton></>}
    >
      <div className="flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3.5 text-[13px] text-foreground">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-destructive" />
        <span className="text-pretty">Esto <strong className="font-semibold">no se puede deshacer</strong>. Se borran su nombre, su contacto, su ficha de salud, sus notas y su historia. Las facturas y los recibos se conservan sin su nombre, porque la ley obliga a guardarlos.</span>
      </div>
      <div>
        <L>Escribe su nombre para confirmar <Nota n={4} /></L>
        <div className="rounded-lg border border-input px-3 py-2 text-[13px] text-muted-foreground">Carmen Del Río</div>
        <p className="mt-1.5 text-[12px] text-muted-foreground">Solo lo puede hacer la propietaria del estudio.</p>
      </div>
    </Dialogo>
  );
}

export function DialogoCambiarPlan() {
  return (
    <Dialogo
      titulo="Cambiar el plan a 2 clientas"
      sub="Carmen Del Río y Elena Ruiz pasan a Mensual 2×/semana."
      pie={<><Boton>Cancelar</Boton><Boton primario>Cobrar 118 € y cambiar</Boton></>}
    >
      <div className="rounded-xl bg-muted/70 p-3.5 text-[13px] text-foreground">
        <p className="font-semibold">Se harán 2 cobros hoy, de 59 € cada uno (118 € en total)</p>
        <p className="mt-1 text-muted-foreground text-pretty">A la tarjeta que tiene guardada cada una. Si alguna no tiene, su recibo se queda pendiente en Cobros.</p>
      </div>
    </Dialogo>
  );
}

export function DialogoInteresada() {
  const canales: [LucideIcon, string][] = [[Camera, 'Instagram'], [Phone, 'Llamó'], [MessageCircle, 'WhatsApp'], [Store, 'Vino al estudio'], [Users, 'Recomendada'], [Globe, 'Otro']];
  return (
    <Dialogo
      titulo="Apuntar interesada"
      sub="Alguien que ha preguntado y aún no ha reservado. No ocupa plaza de tu plan ni recibe nada automático."
      pie={<><Boton>Cancelar</Boton><Boton primario>Apuntar</Boton></>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div><L>Nombre</L><div className="rounded-lg border border-input px-3 py-2 text-[13px] text-foreground">Rocío</div></div>
        <div><L>Teléfono o email</L><div className="rounded-lg border border-input px-3 py-2 text-[13px] text-foreground">600 111 299</div></div>
      </div>
      <div>
        <L>Por dónde llegó</L>
        <div className="grid grid-cols-3 gap-1.5">
          {canales.map(([I, n], i) => (
            <span key={n} className={cn('flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[12.5px] font-medium', i === 0 ? 'border-foreground bg-foreground text-background' : 'border-border text-foreground')}><I size={14} />{n}</span>
          ))}
        </div>
      </div>
      <div><L>Qué le interesa <span className="font-normal text-muted-foreground">(opcional)</span></L><div className="rounded-lg border border-input px-3 py-2 text-[13px] text-foreground">Pilates en el embarazo, por las tardes</div></div>
      <p className="text-[12px] text-muted-foreground">Solo para contestarle a lo que preguntó. Para mandarle novedades tiene que aceptarlo ella.</p>
    </Dialogo>
  );
}
