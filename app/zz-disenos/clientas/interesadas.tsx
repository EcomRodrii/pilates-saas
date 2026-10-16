'use client';

// TEMPORAL — maqueta de «Interesadas y pruebas» dentro de Clientas. No se commitea.
import { CalendarPlus, Camera, CreditCard, Globe, MessageCircle, MoreHorizontal, Phone, Smartphone, Store, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { Avatar, Boton, Tarjeta } from './comun';
import { CabeceraClientas } from './lista';

type Persona = { n: string; ini: string; canal: [LucideIcon, string]; cuando: string; que: string; accion: [LucideIcon, string]; tono: number };

function Bloque({ titulo, nota, personas }: { titulo: string; nota: string; personas: Persona[] }) {
  return (
    <Tarjeta className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-foreground">{titulo} <span className="font-normal text-muted-foreground">· {personas.length}</span></h3>
        <p className="text-[12.5px] text-muted-foreground">{nota}</p>
      </div>
      <ul className="divide-y divide-border">
        {personas.map(p => {
          const IconoCanal = p.canal[0];
          const IconoAccion = p.accion[0];
          return (
          <li key={p.n} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar ini={p.ini} tono={p.tono} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">{p.n}</p>
              <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><IconoCanal size={13} aria-hidden />{p.canal[1]}</span>
                <span>· {p.cuando}</span>
                <span>· {p.que}</span>
              </p>
            </div>
            <Boton peque icono={MessageCircle}>Escribir</Boton>
            <Boton peque icono={IconoAccion}>{p.accion[1]}</Boton>
            <MoreHorizontal size={18} className="text-muted-foreground" aria-label="Más: descartar, editar" />
          </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

export function DisenoInteresadas() {
  return (
    <>
      <CabeceraClientas pestana="interesadas" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-foreground">
          <strong className="font-semibold">De 12 pruebas en septiembre, 5 compraron.</strong>{' '}
          <span className="text-muted-foreground">En agosto, 3 de 9. Solo sale con 5 casos o más.</span>
        </p>
        <Boton icono={UserPlus} primario>Apuntar interesada</Boton>
      </div>
      <div className="space-y-4">
        <Bloque
          titulo="Preguntaron"
          nota="Las que solo preguntaron no tienen ficha: no ocupan plaza de tu plan ni reciben nada automático. Pasan a ficha al reservar su prueba o comprar."
          personas={[
            { n: 'Julia Prieto', ini: 'JP', tono: 1, canal: [Globe, 'Formulario de tu web'], cuando: 'hace 2 h', que: 'Reformer, por las mañanas', accion: [CalendarPlus, 'Reservar su prueba'] },
            { n: 'Rocío Blanco', ini: 'RB', tono: 2, canal: [Camera, 'Instagram'], cuando: 'ayer', que: 'Pilates en el embarazo', accion: [CalendarPlus, 'Reservar su prueba'] },
            { n: 'Teresa Molina', ini: 'TM', tono: 3, canal: [Phone, 'Llamó'], cuando: 'hace 3 días', que: 'Precios del bono', accion: [CalendarPlus, 'Reservar su prueba'] },
            { n: 'Alba Rubio', ini: 'AR', tono: 0, canal: [Smartphone, 'Se registró en tu app'], cuando: 'hace 5 días', que: 'No ha reservado nada', accion: [CalendarPlus, 'Reservar su prueba'] },
            { n: 'Clara Serrano', ini: 'CS', tono: 4, canal: [Users, 'Recomendada por Irene Castro'], cuando: 'hace 6 días', que: 'Sin detalle', accion: [CalendarPlus, 'Reservar su prueba'] },
          ]}
        />
        <Bloque
          titulo="Con su prueba reservada"
          nota="El día antes le llega el recordatorio de siempre."
          personas={[
            { n: 'Noelia Pastor', ini: 'NP', tono: 0, canal: [Store, 'Vino al estudio'], cuando: 'sáb 4 oct · 10:00', que: 'Reformer con Laura', accion: [CalendarPlus, 'Ver reserva'] },
            { n: 'Eva Lozano', ini: 'EL', tono: 2, canal: [Globe, 'Reservó en tu web'], cuando: 'lun 6 oct · 19:00', que: 'Mat con Sara', accion: [CalendarPlus, 'Ver reserva'] },
          ]}
        />
        <Bloque
          titulo="Vinieron a la prueba y no han comprado"
          nota="El mejor momento es la primera semana. Salen solas de aquí en cuanto compran."
          personas={[
            { n: 'María García', ini: 'MG', tono: 1, canal: [Globe, 'Formulario de tu web'], cuando: 'vino el viernes', que: 'Reformer con Laura', accion: [CreditCard, 'Venderle un plan'] },
            { n: 'Silvia Méndez', ini: 'SM', tono: 3, canal: [Camera, 'Instagram'], cuando: 'vino hace 8 días', que: 'Mat con Sara · le escribiste el lunes', accion: [CreditCard, 'Venderle un plan'] },
          ]}
        />
      </div>
      <p className="mt-3 text-[12.5px] text-muted-foreground">
        Las que no llegan a reservar se borran solas al acabar el plazo que promete tu formulario. «Descartar» la quita de aquí antes.
      </p>
    </>
  );
}
