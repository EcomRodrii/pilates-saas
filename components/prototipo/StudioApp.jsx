'use client';

import React from 'react';

/* Fichero GENERADO — no editar a mano (se regenera desde el prototipo, ver
   abajo). Las reglas se apagan a nivel de fichero en vez de tocar el código
   generado, que es justo lo que no hay que hacer:
   - no-this-alias / no-unused-vars: el generador emite `const self = this`.
   - no-img-element: son <img> con rutas literales del prototipo; cambiarlas
     por next/image desviaría el pintado respecto al diseño de referencia,
     que es exactamente lo que esta página existe para NO hacer. */
/* eslint-disable @typescript-eslint/no-this-alias, @typescript-eslint/no-unused-vars, @next/next/no-img-element */

/* StudioApp.jsx — generado automáticamente desde el prototipo
   "Tentare Studio App.dc.html". Toda la app: pantallas, sheets, estado y
   estilos literales. Para Next.js: añadir 'use client' y export default,
   y cargar Plus Jakarta Sans + IBM Plex Mono (ver README-REACT.md).
   Nota: los estados hover/active del prototipo (style-hover/style-active)
   no viajan en esta versión — son azúcar del runtime de prototipado. */

const S = (s) => { const o = {}; String(s).split(';').forEach(d => { const i = d.indexOf(':'); if (i < 0) return; let k = d.slice(0, i).trim(); const v = d.slice(i + 1).trim(); if (!k) return; if (k.startsWith('--')) { o[k] = v; return; } k = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); o[k] = v; }); return o; };

const CSS = "\nbody{margin:0;background:#E9E7DE;font-family:var(--font-jakarta),system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#1A1A1A}\na{color:#1A1A1A;text-decoration:none}a:hover{color:#3E6B4A}\n*{scrollbar-width:none}*::-webkit-scrollbar{display:none}\ninput{outline:none}\n@keyframes apUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}\n@keyframes apFade{from{opacity:0}to{opacity:1}}\n@keyframes apPop{from{opacity:0;transform:scale(.55)}62%{transform:scale(1.07)}to{opacity:1;transform:scale(1)}}\n@keyframes apCheck{0%{transform:scale(0)}55%{transform:scale(1.18)}100%{transform:scale(1)}}\n@keyframes apRing{0%{transform:scale(.4);opacity:.6}100%{transform:scale(2);opacity:0}}\n@keyframes apSkel{from{background-position:-200px 0}to{background-position:200px 0}}\n@keyframes apPulse{0%,100%{opacity:1}50%{opacity:.35}}\n@keyframes apHeart{0%{transform:scale(1)}40%{transform:scale(1.45)}100%{transform:scale(1)}}\n@keyframes apToast{from{opacity:0;transform:translateY(-18px) scale(.94)}to{opacity:1;transform:none}}\n@keyframes apKen{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}\n@keyframes apDot{0%{transform:scale(0)}60%{transform:scale(1.4)}100%{transform:scale(1)}}\n@keyframes apConfA{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(-46px,-110px) rotate(320deg)}}\n@keyframes apConfB{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(8px,-130px) rotate(-280deg)}}\n@keyframes apConfC{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(52px,-100px) rotate(260deg)}}\n@keyframes apSpin{to{transform:rotate(360deg)}}\n@keyframes apZoomIn{from{transform:scale(1.14);opacity:.55}to{transform:scale(1);opacity:1}}\n@keyframes apSlideDown{from{opacity:0;transform:translateY(-70px) scale(.95)}to{opacity:1;transform:none}}\n@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}\n";


class Component extends React.Component {
  CAT = [
    { id: 'c1', dia: 0, hora: '18:00', nombre: 'Reformer · nivel medio', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 5, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c3', dia: 0, hora: '19:00', nombre: 'Mat · core y movilidad', tipo: 'Mat', inst: 'Ana P.', ini: 'AP', plazas: 6, estudio: 'Espai Llum', est: 'llum', precio: 15, dur: 45 },
    { id: 'c2', dia: 0, hora: '19:30', nombre: 'Reformer · intenso', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 2, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c10', dia: 0, hora: '20:00', nombre: 'Reformer · barre fusión', tipo: 'Reformer', inst: 'Lucía R.', ini: 'LR', plazas: 1, estudio: 'Nord Pilates', est: 'nord', precio: 17, dur: 50 },
    { id: 'c4', dia: 0, hora: '20:30', nombre: 'Reformer · suave', tipo: 'Reformer', inst: 'Lucía R.', ini: 'LR', plazas: 0, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c5', dia: 1, hora: '9:00', nombre: 'Reformer · despertar', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 4, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c11', dia: 1, hora: '10:00', nombre: 'Barre · energía', tipo: 'Reformer', inst: 'Lucía R.', ini: 'LR', plazas: 4, estudio: 'Nord Pilates', est: 'nord', precio: 17, dur: 45 },
    { id: 'c6', dia: 1, hora: '12:00', nombre: 'Mat · espalda sana', tipo: 'Mat', inst: 'Ana P.', ini: 'AP', plazas: 6, estudio: 'Espai Llum', est: 'llum', precio: 15, dur: 45 },
    { id: 'c7', dia: 1, hora: '18:00', nombre: 'Reformer · prenatal', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 3, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c8', dia: 2, hora: '9:00', nombre: 'Reformer · nivel medio', tipo: 'Reformer', inst: 'Lucía R.', ini: 'LR', plazas: 5, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c12', dia: 2, hora: '18:30', nombre: 'Yoga · flow suave', tipo: 'Mat', inst: 'Ana P.', ini: 'AP', plazas: 5, estudio: 'Espai Llum', est: 'llum', precio: 15, dur: 60 },
    { id: 'c9', dia: 2, hora: '19:30', nombre: 'Reformer · intenso', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 6, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c13', dia: 3, hora: '9:00', nombre: 'Reformer · despertar', tipo: 'Reformer', inst: 'Lucía R.', ini: 'LR', plazas: 5, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c14', dia: 3, hora: '12:00', nombre: 'Mat · espalda sana', tipo: 'Mat', inst: 'Ana P.', ini: 'AP', plazas: 6, estudio: 'Studio Alma', est: 'alma', precio: 15, dur: 45 },
    { id: 'c15', dia: 3, hora: '18:00', nombre: 'Reformer · nivel medio', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 4, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c16', dia: 3, hora: '19:30', nombre: 'Reformer · intenso', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 2, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c17', dia: 4, hora: '10:00', nombre: 'Reformer · prenatal', tipo: 'Reformer', inst: 'Marta G.', ini: 'MG', plazas: 3, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c18', dia: 4, hora: '12:00', nombre: 'Reformer · suave', tipo: 'Reformer', inst: 'Lucía R.', ini: 'LR', plazas: 6, estudio: 'Studio Alma', est: 'alma', precio: 18, dur: 50 },
    { id: 'c19', dia: 4, hora: '18:00', nombre: 'Mat · core y movilidad', tipo: 'Mat', inst: 'Ana P.', ini: 'AP', plazas: 5, estudio: 'Studio Alma', est: 'alma', precio: 15, dur: 45 }
  ];
  DIAS = ['Hoy', 'Mañana', 'Jue 27', 'Vie 28', 'Sáb 29'];
  ESTUDIOS = {
    alma: { nombre: 'Studio Alma', foto: '/assets/foto-reformer.webp', meta: '★ 4,9 (128) · Gràcia, Barcelona · 1,2 km', t1: 'Reformer', t2: 'Mat', t3: 'máx. 6 alumnas', desc: 'Estudio boutique de Reformer en Gràcia. Grupos de máximo 6, máquinas Balanced Body y 5 instructoras en el equipo.', cta: 'Reservar la próxima · hoy 19:30', fav: 'favA' },
    llum: { nombre: 'Espai Llum', foto: '/assets/foto-estudio.webp', meta: '★ 4,8 (94) · Eixample, Barcelona · 2,1 km', t1: 'Mat', t2: 'Yoga', t3: 'luz natural', desc: 'Loft de luz natural en el Eixample. Mat, yoga y movilidad en grupos reducidos, con talleres de posparto una vez al mes.', cta: 'Reservar la próxima · hoy 19:00', fav: 'favL' },
    nord: { nombre: 'Nord Pilates', foto: '/assets/foto-clase.webp', meta: '★ 4,7 (61) · Poblenou, Barcelona · 2,8 km', t1: 'Reformer', t2: 'Barre', t3: 'junto al mar', desc: 'Reformer y barre a dos calles de la playa del Poblenou. Ambiente de barrio, 4 máquinas y clases al amanecer.', cta: 'Reservar la próxima · hoy 20:00', fav: 'favN' }
  };
  INSTS = {
    marta: { nombre: 'Marta G.', foto: '/assets/foto-pilates.jpg', rating: '★ 4,9 (12)', zona: 'Gràcia · 6 años', t1: 'Reformer', t2: 'Prenatal', t3: 'Suelo pélvico', bio: 'Formada en Balanced Body y especializada en Reformer clínico. Da clase en Studio Alma desde 2023 y acepta sustituciones por las tardes.', exp: 'Studio Alma · 3 años', cert: 'Balanced Body · NPCP', disp: 'Sustituciones · tardes', tarifa: '30–35 €/h' },
    lucia: { nombre: 'Lucía R.', foto: '/assets/foto-clase.webp', rating: '★ 5,0 (8)', zona: 'Sant Antoni · 4 años', t1: 'Reformer', t2: 'Barre', t3: 'HIIT suave', bio: 'Bailarina reconvertida al Reformer. Freelance por las tardes y cubre sustituciones el mismo día si le encaja la zona.', exp: 'Nord Pilates · 2 años', cert: 'Polestar · Barre Certified', disp: 'Sustituciones · mismo día', tarifa: '28–32 €/h' },
    ana: { nombre: 'Ana P.', foto: '/assets/foto-hero.jpg', rating: '★ 4,8 (21)', zona: 'Eixample · 8 años', t1: 'Mat', t2: 'Yoga', t3: 'Prenatal', bio: 'Ocho años entre mat y yoga. Da las clases de core de Espai Llum y talleres de posparto una vez al mes.', exp: 'Espai Llum · 4 años', cert: 'Yoga Alliance 500h', disp: 'Freelance · mañanas', tarifa: '25–30 €/h' }
  };
  SLIDES = [
    { f: '/assets/foto-reformer.webp', k: '01 · Reserva', t: 'Tu clase, en tres toques.', s: 'Plazas reales de cada clase y reserva con tu bono en segundos. Sin llamadas, sin WhatsApp.' },
    { f: '/assets/foto-clase.webp', k: '02 · Tu bono', t: 'Siempre sabes cuánto te queda.', s: 'Sesiones visibles, cancelación clara y recuperación automática si cancelas a tiempo.' },
    { f: '/assets/foto-pilates.jpg', k: '03 · La red', t: 'Estudios e instructoras verificadas.', s: 'Descubre estudios cerca de ti y perfiles reales de Tentare Network.' }
  ];
  DIST = { alma: 0.9, llum: 2.1, nord: 2.8 };
  LOGROS = [
    { id: 'g1', e: '🎉', n: 'Primera clase', d: 'Asiste a tu primera clase en Studio Alma.', meta: 1 },
    { id: 'g2', e: '🔥', n: 'Racha de 3 semanas', d: 'Entrena al menos una vez por semana durante 3 semanas seguidas.', meta: 3 },
    { id: 'g3', e: '🌅', n: 'Madrugadora', d: 'Completa 5 clases que empiecen antes de las 9:00.', meta: 5 },
    { id: 'g4', e: '💯', n: '50 clases', d: 'Suma 50 clases en el estudio desde que eres socia.', meta: 50 }
  ];
  _logroCur(id) { const s = this.state; return id === 'g1' ? 1 : id === 'g2' ? 3 : id === 'g3' ? 2 : id === 'g4' ? 27 + s.reservas.length : id === 'reto' ? Math.min(5, 2 + s.reservas.length) : 0; }
  state = { tab: 'hoy', seg: 0, dia: 0, filtro: 'todo', mapa: false, pin: 1, pantalla: null, cargando: false, sheet: null, claseId: null, btn: 'normal', paso: 1, reservas: [], espera: [], liberada: false, bono: 3, favA: false, favL: false, favN: false, favI: {}, toast: null, q: '', estrellas: 0, chips: {}, valorada: false, notifDot: true, fase: 'splash', slide: 0, regNombre: '', nombre: null, push: null, estId: 'alma', insId: 'marta', pagoPaso: 'elige', pagoSel: 'b5', metodo: 'visa', recibos: [{ c: 'Bono 5 sesiones · Studio Alma', f: '2 ago', i: '79 €' }], subst: 'push', segs: 0, dragX: 0, shY: 0, ptr: 0, refrescando: false, cerca: false, precio15: false, mapaExt: false, fotoVisor: null, paseEstado: 'activo', paseCodigo: 'K3M-9F2', plazaFija: 'ACTIVA', ajUsuario: 'laura.pilates', ajEmail: 'laura@email.com', emailPaso: 'form', emailNuevo: '', emailCod: '', passA: '', passN: '', passR: '', logroSel: null, cama: 'R3', oferta: null, ofertaSeg: 600, chatMsgs: [{ mio: false, t: '¡Hola! Aquí tienes la confirmación de tus reservas y cualquier aviso del estudio 💚' }, { mio: false, t: 'Si no puedes venir a una clase, cancela desde la app hasta 12 h antes y recuperas la sesión.' }], chatQ: '', chatTyping: false, sub: 'pend', reagId: null };
  _push(emoji, t, c, tap) { clearTimeout(this._tp); this.setState({ push: { emoji, t, c, tap } }); this._tp = setTimeout(() => this.setState({ push: null }), 4800); }
  _abrirEst(id) { this.setState({ estId: id, pantalla: 'estudio', cargando: true, sheet: null }); this._skel(); }
  _abrirIns(id, e) { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ insId: id, pantalla: 'marta', sheet: null }); }
  _fin() { this.setState({ fase: 'app' }); this._toast('¡Todo listo, ' + (this.state.nombre || this.props.nombreAlumna || 'Laura') + '! 🎉'); }
  _tgl(on) { return { position: 'relative', width: 44, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', background: on ? '#4F8A5B' : '#D9D6C9', transition: 'background .25s', flexShrink: 0 }; }
  _knob(on) { return { position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 2px 6px rgba(26,26,26,.25)', transform: on ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .25s cubic-bezier(.34,1.3,.5,1)' }; }
  _toast(msg) { clearTimeout(this._tt); this.setState({ toast: msg }); this._tt = setTimeout(() => this.setState({ toast: null }), 2300); }
  _plazas(c) { let p = c.plazas - (this.state.reservas.includes(c.id) ? 1 : 0); if (c.id === 'c4' && this.state.liberada) p += 1; return p; }
  _item(c, i) {
    const s = this.state, res = s.reservas.includes(c.id), esp = s.espera.includes(c.id), p = this._plazas(c);
    const base = { fontSize: 10, fontWeight: 800, padding: '5px 10px', borderRadius: 999, whiteSpace: 'nowrap' };
    let badge, css;
    if (res) { badge = 'Reservada ✓'; css = { ...base, background: '#4F8A5B', color: '#fff' }; }
    else if (c.id === 'c4' && s.liberada && !res) { badge = '1 plaza · liberada'; css = { ...base, background: '#EAF0E7', color: '#2E5A3A', animation: 'apPulse 1.6s infinite' }; }
    else if (esp) { badge = 'En lista · 2ª'; css = { ...base, background: '#F6EEDD', color: '#8A6A25' }; }
    else if (p === 0) { badge = 'Llena · lista'; css = { ...base, background: '#F4E9E5', color: '#A04A3C' }; }
    else if (p === 1) { badge = '1 plaza'; css = { ...base, background: '#F6EEDD', color: '#8A6A25' }; }
    else { badge = p + ' plazas'; css = { ...base, background: '#EAF0E7', color: '#2E5A3A' }; }
    return { ...c, badge, badgeCss: css, precioTxt: c.precio + ' € · bono', delay: (i * 55) + 'ms', avatar: c.inst === 'Marta G.' ? '/assets/foto-pilates.jpg' : c.inst === 'Lucía R.' ? '/assets/foto-clase.webp' : '/assets/foto-hero.jpg', diaHora: this.DIAS[c.dia].toLowerCase() + ' ' + c.hora, abrir: () => this._abrirClase(c.id) };
  }
  _abrirClase(id) {
    const s = this.state;
    if (s.reservas.includes(id)) { this.setState({ claseId: id, sheet: 'cancelar' }); return; }
    const c = this.CAT.find(x => x.id === id);
    const oc = c ? Math.max(0, 6 - this._plazas(c)) : 0;
    this.setState({ claseId: id, sheet: 'clase', paso: 1, btn: 'normal', cama: 'R' + Math.min(6, oc + 1) });
  }
  _finOferta(msg) { clearInterval(this._tof); this.setState({ oferta: null }); if (msg) this._toast(msg); }
  renderVals() {
    const s = this.state, self = this;
    const clase = this.CAT.find(c => c.id === s.claseId) || this.CAT[2];
    const pl = this._plazas(clase);
    const tabB = { position: 'relative', display: 'flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', fontFamily: 'inherit', cursor: 'pointer', color: '#8A8A80', padding: '11px 15px', borderRadius: 999, transition: 'all .25s cubic-bezier(.2,.7,0,1)' };
    const tabOn = { ...tabB, color: '#F1ECE1', background: '#1A1A1A', padding: '11px 18px' };
    const lblTab = (on) => ({ fontSize: 12, fontWeight: 800, display: on ? 'inline' : 'none' });
    const segB = { flex: 1, position: 'relative', zIndex: 2, border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, padding: '9px 0', cursor: 'pointer', color: '#98A093', transition: 'color .25s' };
    const segOn = { ...segB, color: '#1A1A1A' };
    const fB = { border: '1px solid #D9D6C9', background: '#fff', color: '#5A5A52', borderRadius: 999, padding: '7px 14px', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .2s' };
    const fOn = { ...fB, border: '1px solid #4F8A5B', background: '#EAF0E7', color: '#2E5A3A' };
    const dB = { flexShrink: 0, border: '1.5px solid #E5E3DA', background: '#fff', borderRadius: 13, padding: '6px 14px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', textAlign: 'center', transition: 'all .22s', color: '#1A1A1A' };
    const dOn = { ...dB, border: '1.5px solid #1A1A1A', background: '#1A1A1A', color: '#F1ECE1' };
    const dMiniB = { flex: 1, border: '1px solid #E5E3DA', background: '#fff', borderRadius: 999, padding: '7px 0', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', transition: 'all .22s', color: '#5A5A52' };
    const dMiniOn = { ...dMiniB, border: '1px solid #1A1A1A', background: '#1A1A1A', color: '#F1ECE1' };
    const estB = { border: 'none', background: 'none', fontFamily: 'inherit', fontSize: 32, cursor: 'pointer', color: '#E5E3DA', padding: '0 2px', transition: 'color .15s,transform .15s' };
    const estOn = { ...estB, color: '#C99A3C' };
    const chB = { border: '1px solid #D9D6C9', background: '#fff', color: '#5A5A52', borderRadius: 999, padding: '7px 13px', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', transition: 'all .2s' };
    const chOn = { ...chB, border: '1px solid #1A1A1A', background: '#1A1A1A', color: '#F1ECE1' };
    const E = this.ESTUDIOS[s.estId], I = this.INSTS[s.insId];
    const visibles = this.CAT.filter(c => c.est === 'alma' && c.dia === s.dia && (s.filtro === 'todo' || c.tipo.toLowerCase() === s.filtro) && (!s.precio15 || (this._plazas(c) > 0 && !s.reservas.includes(c.id)))).map((c, i) => this._item(c, i));
    const alma = this.CAT.filter(c => c.dia === s.dia && c.est === s.estId).map((c, i) => this._item(c, i));
    const marta = this.CAT.filter(c => c.inst === I.nombre).slice(0, 3).map((c, i) => this._item(c, i));
    const huecos = this.CAT.filter(c => c.est === 'alma' && c.dia === 0 && this._plazas(c) > 0 && !s.reservas.includes(c.id)).slice(0, 2).map((c, i) => this._item(c, i));
    const misRes = s.reservas.map(id => { const c = this.CAT.find(x => x.id === id); return { ...c, dia: this.DIAS[c.dia], cancelar: () => this.setState({ claseId: id, sheet: 'cancelar' }), cambiar: () => this.setState({ claseId: id, reagId: id, sheet: 'reagendar' }) }; });
    const reagBase = s.reagId ? this.CAT.find(x => x.id === s.reagId) : null;
    const reagOps = reagBase ? this.CAT.filter(c => c.est === reagBase.est && c.dia === reagBase.dia && c.id !== reagBase.id && this._plazas(c) > 0 && !s.reservas.includes(c.id)).map((c, i) => ({ ...this._item(c, i), diaTxt: this.DIAS[c.dia].toLowerCase(), pasar: () => { this.setState(st => ({ reservas: st.reservas.map(id => id === st.reagId ? c.id : id), sheet: null })); this._toast('Cambiada a las ' + c.hora + ' ✓'); } })) : [];
    const q = s.q.trim().toLowerCase();
    const CATB = [
      { icono: '🏛', nombre: 'Studio Alma', meta: 'Estudio · Gràcia · ★ 4,9 · Reformer, Mat', k: 'studio alma reformer mat gracia', abrir: () => { this.setState({ pantalla: 'estudio', cargando: true, sheet: null }); this._skel(); } },

      { icono: '🧘', nombre: 'Marta G.', meta: 'Instructora · Reformer, Prenatal · ★ 4,9', k: 'marta reformer prenatal instructora', abrir: () => this.setState({ pantalla: 'marta' }) },
      { icono: '🧘', nombre: 'Lucía R.', meta: 'Instructora · Reformer, Barre · ★ 5,0', k: 'lucia reformer barre instructora', abrir: () => this._abrirIns('lucia') },
      { icono: '🧘', nombre: 'Ana P.', meta: 'Instructora · Mat, Yoga · ★ 4,8', k: 'ana mat yoga prenatal instructora', abrir: () => this._abrirIns('ana') },
      { icono: '📅', nombre: 'Clases de Reformer hoy', meta: '4 clases · desde 18 €', k: 'reformer hoy clases', abrir: () => this.setState({ pantalla: null, tab: 'explorar', seg: 0, filtro: 'reformer', dia: 0 }) },
      { icono: '📅', nombre: 'Clases prenatal', meta: 'mañana 18:00 · Studio Alma', k: 'prenatal embarazo', abrir: () => this.setState({ pantalla: null, tab: 'explorar', seg: 0, filtro: 'reformer', dia: 1 }) }
    ];
    const resultados = q ? CATB.filter(r => r.k.includes(q) || r.nombre.toLowerCase().includes(q)) : [];
    const pinD = s.pin === 2
      ? { foto: '/assets/foto-estudio.webp', nombre: 'Espai Llum ★ 4,8', meta: 'Eixample · 2,1 km · Mat, Yoga', clase: 'hoy 19:00 · 6 plazas · 15 €', abrir: () => this._abrirEst('llum') }
      : s.pin === 3
        ? { foto: '/assets/foto-clase.webp', nombre: 'Nord Pilates ★ 4,7', meta: 'Poblenou · 2,8 km · Reformer, Barre', clase: 'hoy 20:00 · 1 plaza · 17 €', abrir: () => this._abrirEst('nord') }
        : { foto: '/assets/foto-reformer.webp', nombre: 'Studio Alma ★ 4,9', meta: 'Gràcia · 1,2 km · Reformer, Mat', clase: 'hoy 19:30 · ' + this._plazas(this.CAT[2]) + ' plazas · 18 €', abrir: () => this._abrirEst('alma') };
    const nombre = s.nombre || (this.props.nombreAlumna ?? 'Laura');
    const hh = new Date().getHours();
    const favCss = (on) => on ? 'color:#C2503A;animation:apHeart .32s' : 'color:#1A1A1A';
    const hFav = (k, nom) => (e) => { e.stopPropagation(); const on = !this.state[k]; this.setState({ [k]: on }); this._toast(on ? nom + ' guardado en favoritos ♥' : nom + ' quitado de favoritos'); };
    return {
      nombre, iniciales: nombre.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase(),
      saludo: hh < 13 ? 'Buenos días' : hh < 20 ? 'Buenas tardes' : 'Buenas noches',
      hayToast: !!s.toast, toastMsg: s.toast,
      esHoy: s.tab === 'hoy', esExplorar: s.tab === 'explorar', esReservas: s.tab === 'reservas', esPerfil: s.tab === 'perfil',
      tabHoy: () => this.setState({ tab: 'hoy', pantalla: null }), tabExplorar: () => this.setState({ tab: 'explorar', pantalla: null }),
      tabReservas: () => this.setState({ tab: 'reservas', pantalla: null }), tabPerfil: () => this.setState({ tab: 'perfil', pantalla: null }),
      tHoy: s.tab === 'hoy' ? tabOn : tabB, tExplorar: s.tab === 'explorar' ? tabOn : tabB, tReservas: s.tab === 'reservas' ? tabOn : tabB, tPerfil: s.tab === 'perfil' ? tabOn : tabB,
      tHoyLbl: lblTab(s.tab === 'hoy'), tExplorarLbl: lblTab(s.tab === 'explorar'), tReservasLbl: lblTab(s.tab === 'reservas'), tPerfilLbl: lblTab(s.tab === 'perfil'),
      irExplorar: () => this.setState({ tab: 'explorar', pantalla: null }),
      irMapa: () => this.setState({ tab: 'explorar', seg: 0, mapa: true }),
      segT: 'translateX(' + (s.seg * 100) + '%)',
      segClases: () => this.setState({ seg: 0 }), segEstudios: () => this.setState({ seg: 1 }), segInst: () => this.setState({ seg: 2 }),
      segCss0: s.seg === 0 ? segOn : segB, segCss1: s.seg === 1 ? segOn : segB, segCss2: s.seg === 2 ? segOn : segB,
      segEsClases: true, segEsEstudios: false, segEsInst: false,
      dias: this.DIAS.map((label, i) => ({ label, sub: ['mar 25', 'mié 26', 'jue 27', 'vie 28', 'sáb 29'][i], sel: () => this.setState({ dia: i }), css: s.dia === i ? dOn : dB, cssMini: s.dia === i ? dMiniOn : dMiniB })),
      diaLabel: this.DIAS[s.dia],
      fTodo: () => this.setState({ filtro: 'todo' }), fReformer: () => this.setState({ filtro: 'reformer' }), fMat: () => this.setState({ filtro: 'mat' }),
      fTodoCss: s.filtro === 'todo' ? fOn : fB, fReformerCss: s.filtro === 'reformer' ? fOn : fB, fMatCss: s.filtro === 'mat' ? fOn : fB,
      fCerca: () => this.setState(st => ({ cerca: !st.cerca })), fPrecio: () => this.setState(st => ({ precio15: !st.precio15 })),
      fCercaCss: s.cerca ? fOn : fB, fPrecioCss: s.precio15 ? fOn : fB,
      clases: visibles, nClases: visibles.length, huecosHoy: huecos,
      nHoy: this.CAT.filter(c => c.dia === 0 && this._plazas(c) > 0).length,
      alternarMapa: () => this.setState(st => ({ mapa: !st.mapa })),
      vistaLista: !s.mapa, vistaMapa: s.mapa, mapaTxt: s.mapa ? 'Lista' : 'Mapa', mapaBg: s.mapa ? '#1A1A1A' : '#fff', mapaFg: s.mapa ? '#F1ECE1' : '#1A1A1A',
      selPin1: () => this.setState({ pin: 1 }), selPin2: () => this.setState({ pin: 2 }), selPin3: () => this.setState({ pin: 3 }),
      pin1Bg: s.pin === 1 ? '#1A1A1A' : '#fff', pin1Fg: s.pin === 1 ? '#F1ECE1' : '#1A1A1A', pin2Bg: s.pin === 2 ? '#1A1A1A' : '#fff', pin2Fg: s.pin === 2 ? '#F1ECE1' : '#1A1A1A', pin3Bg: s.pin === 3 ? '#1A1A1A' : '#fff', pin3Fg: s.pin === 3 ? '#F1ECE1' : '#1A1A1A',
      pinFoto: pinD.foto, pinNombre: pinD.nombre, pinMeta: pinD.meta, pinClase: pinD.clase, pinAbrir: pinD.abrir,
      abrirAlma: () => this._abrirEst('alma'), abrirLlum: () => this._abrirEst('llum'), abrirNord: () => this._abrirEst('nord'),
      cerrarPantalla: () => this.setState({ pantalla: null, dragX: 0 }),
      estudioT: s.pantalla === 'estudio' ? 'translateX(' + s.dragX + 'px)' : 'translateX(103%)', estudioPe: s.pantalla === 'estudio' ? 'auto' : 'none',
      pushTrans: this._swOn ? 'none' : 'transform .38s cubic-bezier(.3,.9,.2,1)',
      swPD: (e) => { this._swOn = true; this._sx = e.clientX; if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); },
      swPM: (e) => { if (!this._swOn) return; this.setState({ dragX: Math.max(0, e.clientX - this._sx) }); },
      swPU: () => { const d = this.state.dragX; this._swOn = false; if (d > 110) this.setState({ pantalla: null, dragX: 0 }); else this.setState({ dragX: 0 }); },
      estFoto: E.foto, estNombre: E.nombre, estMeta: E.meta, estTag1: E.t1, estTag2: E.t2, estTag3: E.t3, estDesc: E.desc, estCta: E.cta,
      insFoto: I.foto, insNombre: I.nombre, insRating: I.rating, insZona: I.zona, insTag1: I.t1, insTag2: I.t2, insTag3: I.t3, insBio: I.bio, insExp: I.exp, insCert: I.cert, insDisp: I.disp, insTarifa: I.tarifa,
      clasesEst: alma, clasesIns: marta,
      cargando: s.cargando, listoEstudio: !s.cargando,
      abrirMarta: (e) => this._abrirIns('marta', e), abrirLucia: (e) => this._abrirIns('lucia', e), abrirAna: (e) => this._abrirIns('ana', e),
      cerrarMarta: () => this.setState(st => ({ pantalla: st.claseId && st.sheet ? 'estudio' : null })),
      martaT: s.pantalla === 'marta' ? 'translateX(0)' : 'translateX(103%)', martaPe: s.pantalla === 'marta' ? 'auto' : 'none',
      abrirBuscar: () => this.setState({ pantalla: 'buscar' }),
      cerrarBuscar: () => this.setState({ pantalla: null, q: '' }),
      buscarOp: s.pantalla === 'buscar' ? 1 : 0, buscarT: s.pantalla === 'buscar' ? 'translateY(0)' : 'translateY(14px)', buscarPe: s.pantalla === 'buscar' ? 'auto' : 'none',
      q: s.q, onQ: (e) => this.setState({ q: e.target.value }),
      qReformer: () => this.setState({ q: 'reformer' }), qMarta: () => this.setState({ q: 'marta' }), qPrenatal: () => this.setState({ q: 'prenatal' }),
      sinQ: !q, conQ: !!q, resultados, nResultados: resultados.length, sinResultados: !!q && resultados.length === 0,
      abrirNotifs: () => this.setState({ sheet: 'notif', notifDot: false }),
      notifDot: s.notifDot, notifLiberada: !!s.oferta,
      abrirLiberada: () => this.setState({ sheet: 'oferta' }),
      cerrarSheet: () => this.setState({ sheet: null }),
      velo: s.sheet ? 1 : 0, veloPe: s.sheet ? 'auto' : 'none',
      sheetClaseT: s.sheet === 'clase' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      sheetCancelT: s.sheet === 'cancelar' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      sheetValorarT: s.sheet === 'valorar' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      sheetNotifT: s.sheet === 'notif' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      sheetPagoT: s.sheet === 'pago' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      shTrans: this._shOn ? 'none' : 'transform .38s cubic-bezier(.34,1.3,.5,1)',
      shPD: (e) => { this._shOn = true; this._shy = e.clientY; if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); },
      shPM: (e) => { if (!this._shOn) return; this.setState({ shY: Math.max(0, e.clientY - this._shy) }); },
      shPU: () => { const d = this.state.shY; this._shOn = false; if (d > 110) this.setState({ shY: 0, sheet: null }); else this.setState({ shY: 0 }); },
      claseNombre: clase.nombre, claseHora: clase.hora, claseInst: clase.inst, claseEstudio: clase.estudio, claseDur: clase.dur, claseDia: this.DIAS[clase.dia].toLowerCase(), clasePrecio: clase.precio,
      conBono: s.bono > 0, sinBono: s.bono === 0,
      btnConfTxt: s.bono > 0 ? 'Confirmar ' + clase.hora + ' con bono' : 'Pagar ' + clase.precio + ' € y reservar',
      clasePlazasTxt: pl === 1 ? 'última plaza' : pl + ' plazas', clasePlazasCss: { fontSize: 10.5, fontWeight: 800, padding: '5px 11px', borderRadius: 999, background: pl <= 1 ? '#F6EEDD' : '#EAF0E7', color: pl <= 1 ? '#8A6A25' : '#2E5A3A', whiteSpace: 'nowrap' },
      modoEspera: s.sheet === 'clase' && pl === 0 && !s.espera.includes(clase.id),
      paso1: s.sheet === 'clase' && s.paso === 1 && !(pl === 0 && !s.espera.includes(clase.id)), paso2: s.sheet === 'clase' && s.paso === 2,
      btnNormal: s.btn === 'normal', btnOk: s.btn === 'ok', btnProc: s.btn === 'proc',
      btnConfirmarCss: { width: '100%', height: 50, marginTop: 12, border: 'none', borderRadius: 999, background: s.btn === 'ok' ? '#4F8A5B' : '#1A1A1A', color: '#F1ECE1', fontFamily: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'background .18s,transform .18s', transform: s.btn === 'ok' ? 'scale(.97)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' },
      confirmar: () => {
        if (this.state.btn !== 'normal') return;
        const conBono = this.state.bono > 0;
        const fin = () => this.setState(st => ({ paso: 2, reservas: [...st.reservas, st.claseId], bono: conBono ? Math.max(0, st.bono - 1) : st.bono, liberada: st.claseId === 'c4' ? false : st.liberada, recibos: conBono ? st.recibos : [{ c: 'Clase suelta · ' + clase.estudio, f: 'hoy', i: clase.precio + ' €' }, ...st.recibos] }));
        clearTimeout(this._tk);
        if (conBono) { this.setState({ btn: 'ok' }); this._tk = setTimeout(fin, 460); }
        else { this.setState({ btn: 'proc' }); this._tk = setTimeout(() => { this.setState({ btn: 'ok' }); this._tk = setTimeout(fin, 340); }, 1150); }
        if (!this._rec) { this._rec = true; this._trm = setTimeout(() => this._push('⏰', 'Tu clase empieza pronto', clase.nombre + ' · ' + clase.hora + ' — sal ya para llegar a tiempo', () => this.setState({ tab: 'reservas', pantalla: null, sheet: null })), 14000); }
      },
      unirmeEspera: () => {
        this.setState(st => ({ espera: [...st.espera, st.claseId], sheet: null }));
        this._toast('Estás en la lista — te avisamos ✓');
        clearTimeout(this._tl);
        this._tl = setTimeout(() => {
          this.setState({ oferta: { claseId: 'c4' }, ofertaSeg: 600, notifDot: true, sheet: 'oferta' });
          this._push('🎉', 'Plaza liberada — es tuya 10 min', 'Reformer · suave · hoy 20:30 — acéptala antes de que caduque', () => this.setState({ sheet: 'oferta' }));
          clearInterval(this._tof);
          this._tof = setInterval(() => {
            const seg = this.state.ofertaSeg - 1;
            if (seg <= 0) { this._finOferta('La plaza pasó a la siguiente de la lista'); if (this.state.sheet === 'oferta') this.setState({ sheet: null }); return; }
            this.setState({ ofertaSeg: seg });
          }, 1000);
        }, 7000);
      },
      sheetOfertaT: s.sheet === 'oferta' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      ofertaTxt: Math.floor(s.ofertaSeg / 60) + ':' + String(s.ofertaSeg % 60).padStart(2, '0'),
      aceptarOferta: () => {
        clearInterval(this._tof);
        this.setState(st => ({ oferta: null, claseId: 'c4', sheet: 'clase', paso: 2, btn: 'ok', cama: 'R6', reservas: [...st.reservas, 'c4'], bono: Math.max(0, st.bono - 1), espera: st.espera.filter(id => id !== 'c4') }));
      },
      rechazarOferta: () => { this._finOferta('Plaza cedida a la siguiente de la lista'); this.setState({ sheet: null }); },
      camas: [1, 2, 3, 4, 5, 6].map(n => {
        const oc = Math.max(0, 6 - pl);
        const id = 'R' + n, ocupada = n <= oc, on = s.cama === id;
        return {
          n: id, sub: ocupada ? 'ocupado' : on ? 'tuyo' : 'libre',
          sel: ocupada ? () => {} : () => this.setState({ cama: id }),
          css: { border: on ? '1.5px solid #1A1A1A' : '1.5px solid #E5E3DA', background: ocupada ? '#EFEDE4' : on ? '#1A1A1A' : '#fff', color: ocupada ? '#B9B6A8' : on ? '#F1ECE1' : '#1A1A1A', borderRadius: 12, padding: '9px 0', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: ocupada ? 'default' : 'pointer', transition: 'all .22s cubic-bezier(.34,1.3,.5,1)', transform: on ? 'scale(1.04)' : 'none' }
        };
      }),
      camaSel: s.cama,
      cancelGratis: clase.dia > 0, cancelTarde: clase.dia === 0,
      btnCancelTxt: clase.dia === 0 ? 'Cancelar igualmente (pierdo la sesión)' : 'Sí, cancelar y recuperar sesión',
      confirmarCancelar: () => {
        const tarde = clase.dia === 0;
        this.setState(st => ({ reservas: st.reservas.filter(id => id !== st.claseId), bono: tarde ? st.bono : Math.min(5, st.bono + 1), sheet: null }));
        this._toast(tarde ? 'Cancelada — la sesión no se devuelve' : 'Sesión devuelta a tu bono ✓');
      },
      tPlan: () => this._toast('Gestión del plan: en la versión completa'),
      verMiReserva: () => this.setState({ sheet: null, pantalla: null, tab: 'reservas' }),
      misReservas: misRes, hayReserva: misRes.length > 0, sinReserva: misRes.length === 0,
      nReservas: misRes.length, badgeReservas: misRes.length > 0,
      hayEspera: s.espera.length > 0 && !s.reservas.includes('c4'),
      proxTxt: misRes.length ? misRes[0].nombre + ' · ' + misRes[0].hora + ' · ' + misRes[0].estudio : '', proxDia: misRes.length ? misRes[0].dia.toLowerCase() : '',
      bono: s.bono, bonoBarra: { width: Math.min(100, s.bono / 5 * 100) + '%', height: '100%', background: '#4F8A5B', borderRadius: 99, transition: 'width .6s cubic-bezier(.2,.7,0,1)' },
      nSesiones: 7 + misRes.length, nFavs: (s.favA ? 1 : 0) + (s.favL ? 1 : 0) + (s.favN ? 1 : 0) + Object.values(s.favI).filter(Boolean).length,
      favAlma: hFav('favA', 'Studio Alma'), favLlum: hFav('favL', 'Espai Llum'),
      favAlmaIco: s.favA ? '♥' : '♡', favLlumIco: s.favL ? '♥' : '♡',
      favAlmaCss: favCss(s.favA), favLlumCss: favCss(s.favL),
      favEst: hFav(E.fav, E.nombre), favEstIco: s[E.fav] ? '♥' : '♡', favEstCss: favCss(s[E.fav]),
      favIns: (e) => { e.stopPropagation(); const on = !s.favI[s.insId]; this.setState(st => ({ favI: { ...st.favI, [st.insId]: on } })); this._toast(on ? I.nombre + ' guardada en favoritos ♥' : I.nombre + ' quitada de favoritos'); },
      favInsIco: s.favI[s.insId] ? '♥' : '♡', favInsCss: favCss(!!s.favI[s.insId]),
      favAlmaOn: s.favA, favLlumOn: s.favL, favMartaOn: !!s.favI.marta, tieneFavs: s.favA || s.favL || !!s.favI.marta, sinFavs: !s.favA && !s.favL && !s.favN && !Object.values(s.favI).some(Boolean),
      plazasC2: this._plazas(this.CAT[2]) + ' plazas',
      abrirProxima: () => this._abrirClase(this.CAT.find(c => c.dia === s.dia && c.est === s.estId && this._plazas(c) > 0 && !s.reservas.includes(c.id))?.id || 'c2'),
      abrirValorar: () => this.setState({ sheet: 'valorar' }),
      est1: () => this.setState({ estrellas: 1 }), est2: () => this.setState({ estrellas: 2 }), est3: () => this.setState({ estrellas: 3 }), est4: () => this.setState({ estrellas: 4 }), est5: () => this.setState({ estrellas: 5 }),
      estCss1: s.estrellas >= 1 ? estOn : estB, estCss2: s.estrellas >= 2 ? estOn : estB, estCss3: s.estrellas >= 3 ? estOn : estB, estCss4: s.estrellas >= 4 ? estOn : estB, estCss5: s.estrellas >= 5 ? estOn : estB,
      chipG: () => this.setState(st => ({ chips: { ...st.chips, g: !st.chips.g } })), chipA: () => this.setState(st => ({ chips: { ...st.chips, a: !st.chips.a } })), chipD: () => this.setState(st => ({ chips: { ...st.chips, d: !st.chips.d } })),
      chipGCss: s.chips.g ? chOn : chB, chipACss: s.chips.a ? chOn : chB, chipDCss: s.chips.d ? chOn : chB,
      btnValorarCss: { width: '100%', height: 48, marginTop: 15, border: 'none', borderRadius: 999, background: s.estrellas ? '#1A1A1A' : '#EFEDE4', color: s.estrellas ? '#F1ECE1' : '#98A093', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800, cursor: s.estrellas ? 'pointer' : 'default', transition: 'all .25s' },
      enviarValoracion: () => { if (!this.state.estrellas) return; this.setState({ valorada: true, sheet: null }); this._toast('¡Gracias! Tu valoración ayuda al estudio ⭐'); },
      sinValorar: !s.valorada, yaValorada: s.valorada, misEstrellas: '★'.repeat(s.estrellas),
      tComoLlegar: () => this._toast('Abriendo cómo llegar… 📍'), tCalendario: () => this._toast('Añadida a tu calendario ✓'),
      tContactar: () => this._toast('Solicitud enviada a ' + I.nombre.split(' ')[0] + ' ✓'), tSustitucion: () => this._toast('Propuesta enviada — te responderá aquí'),
      tAjustes: () => this._toast('Sección de la versión completa'),
      enOnb: s.fase !== 'app', obSplash: s.fase === 'splash', obSlides: s.fase === 'slides', obReg: s.fase === 'reg', obPerm: s.fase === 'perm', obNoti: s.fase === 'noti', obFav: s.fase === 'fav',
      slFoto: this.SLIDES[s.slide].f, slKick: this.SLIDES[s.slide].k, slTit: this.SLIDES[s.slide].t, slSub: this.SLIDES[s.slide].s,
      slBtn: s.slide < 2 ? 'Siguiente' : 'Empezar',
      avanzarSlide: () => this.setState({ fase: 'reg' }),
      saltarOnb: () => this._fin(),
      dot0: { width: s.slide === 0 ? 22 : 7, height: 7, borderRadius: 99, background: s.slide === 0 ? '#FAF9F5' : 'rgba(250,249,245,.45)', transition: 'all .3s' },
      dot1: { width: s.slide === 1 ? 22 : 7, height: 7, borderRadius: 99, background: s.slide === 1 ? '#FAF9F5' : 'rgba(250,249,245,.45)', transition: 'all .3s' },
      dot2: { width: s.slide === 2 ? 22 : 7, height: 7, borderRadius: 99, background: s.slide === 2 ? '#FAF9F5' : 'rgba(250,249,245,.45)', transition: 'all .3s' },
      regNombre: s.regNombre, onRegNombre: (e) => this.setState({ regNombre: e.target.value }),
      regContinuar: () => this.setState(st => ({ nombre: st.regNombre.trim() || null, fase: 'perm' })),
      regSocial: () => { this.setState({ regNombre: 'Laura', nombre: 'Laura', fase: 'perm' }); this._toast('Sesión iniciada ✓'); },
      permitirUbi: () => { this.setState({ fase: 'noti' }); this._toast('📍 Barcelona detectada'); },
      saltarUbi: () => this.setState({ fase: 'noti' }),
      permitirNoti: () => this._fin(),
      saltarNoti: () => this._fin(),
      obFavAlma: () => { this.setState({ favA: true }); this._fin(); },
      obFavLlum: () => { this.setState({ favL: true }); this._fin(); },
      obFavNord: () => { this.setState({ favN: true }); this._fin(); },
      saltarFav: () => this._fin(),
      replayOnb: () => { this.setState({ fase: 'splash', slide: 0, pantalla: null, sheet: null, tab: 'hoy' }); clearTimeout(this._ts); this._ts = setTimeout(() => this.setState({ fase: 'slides' }), 1500); },
      hayPush: !!s.push, pushEmoji: s.push ? s.push.emoji : '', pushT: s.push ? s.push.t : '', pushC: s.push ? s.push.c : '',
      pushTap: () => { const p = this.state.push; this.setState({ push: null }); if (p && p.tap) p.tap(); },
      abrirPago: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ sheet: 'pago', pagoPaso: 'elige' }); },
      pgElige: s.sheet === 'pago' && s.pagoPaso === 'elige', pgProc: s.sheet === 'pago' && s.pagoPaso === 'proc', pgOk: s.sheet === 'pago' && s.pagoPaso === 'ok',
      selB5: () => this.setState({ pagoSel: 'b5' }), selB10: () => this.setState({ pagoSel: 'b10' }),
      b5Css: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 16, fontFamily: 'inherit', cursor: 'pointer', background: '#fff', border: s.pagoSel === 'b5' ? '2px solid #1A1A1A' : '1.5px solid #E5E3DA', transition: 'border .2s' },
      b10Css: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '13px 15px', borderRadius: 16, fontFamily: 'inherit', cursor: 'pointer', background: '#fff', border: s.pagoSel === 'b10' ? '2px solid #1A1A1A' : '1.5px solid #E5E3DA', transition: 'border .2s' },
      metVisa: () => this.setState({ metodo: 'visa' }), metApple: () => this.setState({ metodo: 'apple' }),
      mVisaCss: { flex: 1, height: 44, borderRadius: 999, fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: s.metodo === 'visa' ? '#1A1A1A' : '#fff', color: s.metodo === 'visa' ? '#F1ECE1' : '#1A1A1A', border: s.metodo === 'visa' ? 'none' : '1.5px solid #E5E3DA', transition: 'all .2s' },
      mAppleCss: { flex: 1, height: 44, borderRadius: 999, fontFamily: 'inherit', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: s.metodo === 'apple' ? '#1A1A1A' : '#fff', color: s.metodo === 'apple' ? '#F1ECE1' : '#1A1A1A', border: s.metodo === 'apple' ? 'none' : '1.5px solid #E5E3DA', transition: 'all .2s' },
      pagarTxt: 'Pagar ' + (s.pagoSel === 'b5' ? '79 €' : '149 €') + (s.metodo === 'apple' ? ' con  Pay' : ' con tarjeta'),
      pagoMetodoTxt: s.metodo === 'apple' ? ' Pay' : 'Visa ···· 4242',
      pagoResumen: (s.pagoSel === 'b5' ? 'Bono 5 sesiones · 79 €' : 'Bono 10 sesiones · 149 €') + (s.metodo === 'apple' ? ' ·  Pay' : ' · ···· 4242'),
      pagar: () => {
        this.setState({ pagoPaso: 'proc' });
        clearTimeout(this._tpg);
        this._tpg = setTimeout(() => {
          this.setState(st => ({ pagoPaso: 'ok', recibos: [{ c: 'Bono ' + (st.pagoSel === 'b5' ? 5 : 10) + ' sesiones · Studio Alma', f: 'hoy', i: st.pagoSel === 'b5' ? '79 €' : '149 €' }, ...st.recibos] }));
          clearTimeout(this._twh);
          this._twh = setTimeout(() => this.setState(st => { const n = st.pagoSel === 'b5' ? 5 : 10; this._push('✓', 'Bono activado', 'El estudio ha registrado tu pago — ' + n + ' sesiones ya disponibles'); return { bono: st.bono + n }; }), 4500);
        }, 1400);
      },
      recibos: s.recibos,
      abrirPanel: () => { clearInterval(this._tcr); this.setState({ pantalla: 'panel', subst: 'push', segs: 0 }); },
      cerrarPanel: () => { clearInterval(this._tcr); this.setState({ pantalla: null, subst: 'push', segs: 0 }); },
      panelT: s.pantalla === 'panel' ? 'translateX(0)' : 'translateX(103%)', panelPe: s.pantalla === 'panel' ? 'auto' : 'none',
      ssPush: s.subst === 'push', ssCand: s.subst === 'cand', ssWait: s.subst === 'wait', ssOk: s.subst === 'ok',
      cronoTxt: s.subst === 'push' ? '' : '⏱ ' + s.segs + ' s', segsTxt: s.segs + ' segundos',
      verCandidatas: () => { this.setState({ subst: 'cand' }); this._t0 = Date.now(); clearInterval(this._tcr); this._tcr = setInterval(() => this.setState({ segs: Math.floor((Date.now() - this._t0) / 1000) }), 500); },
      proponerLucia: () => {
        this.setState({ subst: 'wait' });
        clearTimeout(this._tsu);
        this._tsu = setTimeout(() => { clearInterval(this._tcr); this.setState({ subst: 'ok' }); this._push('🎉', 'Lucía ha aceptado', 'Cubre el Reformer de hoy 18:00 — calendario y alumnas, actualizados'); }, 3600);
      },
      hoyRef: (el) => { this._hoy = el; },
      ptrPD: (e) => { if (this._hoy && this._hoy.scrollTop <= 0) { this._ptrOn = true; this._py = e.clientY; } },
      ptrPM: (e) => { if (!this._ptrOn) return; const d = e.clientY - this._py; if (d > 0) this.setState({ ptr: Math.min(d * .45, 74) }); },
      ptrPU: () => {
        if (!this._ptrOn) return; this._ptrOn = false;
        if (this.state.ptr > 56) { this.setState({ ptr: 50, refrescando: true }); clearTimeout(this._tr); this._tr = setTimeout(() => { this.setState({ ptr: 0, refrescando: false }); this._toast('Horario actualizado ✓'); }, 950); }
        else this.setState({ ptr: 0 });
      },
      fechaHoy: (() => { const f = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); return f.charAt(0).toUpperCase() + f.slice(1); })(),
      semana: ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((l, i) => {
        const hoyIdx = (new Date().getDay() + 6) % 7;
        const done = i < hoyIdx && i % 2 === 0;
        const esHoyD = i === hoyIdx;
        return { l, css: { width: 9, height: 9, borderRadius: 99, background: done ? '#4F8A5B' : esHoyD ? (misRes.length ? '#4F8A5B' : '#fff') : '#EFEDE4', border: esHoyD ? '2px solid #1A1A1A' : 'none', boxSizing: 'border-box', transition: 'background .4s' } };
      }),
      vf1: () => this.setState({ fotoVisor: '/assets/foto-pilates.jpg' }), vf2: () => this.setState({ fotoVisor: '/assets/foto-clase.webp' }),
      vf3: () => this.setState({ fotoVisor: '/assets/foto-estudio.webp' }), vf4: () => this.setState({ fotoVisor: '/assets/foto-hero.jpg' }),
      visorOn: !!s.fotoVisor, visorSrc: s.fotoVisor || '', cerrarVisor: () => this.setState({ fotoVisor: null }),
      alternarMapaExt: () => this.setState(st => ({ mapaExt: !st.mapaExt })),
      mapaExtOn: s.mapaExt, mapaExtTxt: s.mapaExt ? 'Ocultar lista ▾' : 'Ver los 3 en lista ▴',
      otro1Nombre: s.pin === 1 ? 'Espai Llum' : 'Studio Alma', otro1Meta: s.pin === 1 ? '★ 4,8 · 2,1 km' : '★ 4,9 · 0,9 km',
      otro2Nombre: s.pin === 3 ? 'Espai Llum' : 'Nord Pilates', otro2Meta: s.pin === 3 ? '★ 4,8 · 2,1 km' : '★ 4,7 · 2,8 km',
      mapaOtro1: () => this._abrirEst(s.pin === 1 ? 'llum' : 'alma'), mapaOtro2: () => this._abrirEst(s.pin === 3 ? 'llum' : 'nord'),
      sheetReagT: s.sheet === 'reagendar' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      sheetPaseT: s.sheet === 'pase' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      sheetPfT: s.sheet === 'pfbaja' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      abrirPase: () => {
        const cod = (Math.random().toString(36).slice(2, 5) + '-' + Math.random().toString(36).slice(2, 5)).toUpperCase();
        this.setState({ sheet: 'pase', paseEstado: 'activo', paseCodigo: cod, claseId: this.state.reservas[0] || this.state.claseId });
        clearTimeout(this._tpa);
        this._tpa = setTimeout(() => { if (this.state.sheet === 'pase') { this.setState({ paseEstado: 'dentro' }); } }, 6000);
      },
      paseActivo: s.paseEstado === 'activo', paseDentro: s.paseEstado === 'dentro', paseCodigo: s.paseCodigo,
      pfHay: s.plazaFija !== null,
      pfBadge: s.plazaFija === 'ACTIVA' ? 'activa' : 'en pausa',
      pfBadgeCss: { fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: s.plazaFija === 'ACTIVA' ? '#EAF0E7' : '#F6EEDD', color: s.plazaFija === 'ACTIVA' ? '#2E5A3A' : '#8A6A25' },
      pfAccion: s.plazaFija === 'ACTIVA' ? 'Pausar (vacaciones)' : 'Reanudar',
      pfToggle: () => { const on = this.state.plazaFija === 'ACTIVA'; this.setState({ plazaFija: on ? 'PAUSADA' : 'ACTIVA' }); this._toast(on ? 'Plaza en pausa — tu sitio te espera ✓' : 'Plaza reactivada: martes 19:30 ✓'); },
      pfBaja: () => this.setState({ sheet: 'pfbaja' }),
      confirmarPfBaja: () => { this.setState({ plazaFija: null, sheet: null }); this._toast('Plaza fija dada de baja'); },
      progresoTxt: Math.min(3, 1 + s.reservas.length) + ' de 3',
      progresoBarra: { width: Math.min(100, (1 + s.reservas.length) / 3 * 100) + '%', height: '100%', background: '#4F8A5B', borderRadius: 99, transition: 'width .6s cubic-bezier(.2,.7,0,1)' },
      retoTxt: Math.min(5, 2 + s.reservas.length) + ' de 5',
      retoBarra: { width: Math.min(100, (2 + s.reservas.length) / 5 * 100) + '%', height: '100%', background: '#C99A3C', borderRadius: 99, transition: 'width .6s cubic-bezier(.2,.7,0,1)' },
      invitar: () => this._toast('Enlace de invitación copiado ✓'),
      bloqueProgreso: this.props.bloqueProgreso ?? true,
      bloqueInvita: this.props.bloqueInvita ?? true,
      asistidas: 27 + s.reservas.length,
      reagOps, sinReagOps: !!reagBase && reagOps.length === 0,
      abrirChat: (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ pantalla: 'chat', sheet: null }); },
      cerrarChat: () => this.setState({ pantalla: null }),
      chatT: s.pantalla === 'chat' ? 'translateX(0)' : 'translateX(103%)', chatPe: s.pantalla === 'chat' ? 'auto' : 'none',
      chatMsgs: s.chatMsgs.map(m => ({ ...m, css: m.mio ? { alignSelf: 'flex-end', maxWidth: '82%', background: '#1A1A1A', color: '#F1ECE1', borderRadius: '16px 16px 5px 16px', padding: '10px 14px', animation: 'apChipInNone' } : { alignSelf: 'flex-start', maxWidth: '82%', background: '#fff', border: '1px solid #E5E3DA', borderRadius: '16px 16px 16px 5px', padding: '10px 14px' } })),
      chatQ: s.chatQ, onChatQ: (e) => this.setState({ chatQ: e.target.value }),
      chatTyping: s.chatTyping,
      enviarChat: () => {
        const t = this.state.chatQ.trim(); if (!t) return;
        this.setState(st => ({ chatMsgs: [...st.chatMsgs, { mio: true, t }], chatQ: '', chatTyping: true }));
        clearTimeout(this._tch);
        const R = ['¡Genial, te esperamos! 💚', 'Anotado — cualquier cosa nos dices por aquí.', '¡Perfecto! Nos vemos en el estudio.'];
        this._tch = setTimeout(() => this.setState(st => ({ chatTyping: false, chatMsgs: [...st.chatMsgs, { mio: false, t: R[(st.chatMsgs.length) % R.length] }] })), 1400);
      },
      abrirInsPan: () => this.setState({ pantalla: 'insPan' }),
      cerrarInsPan: () => this.setState({ pantalla: null }),
      insPanT: s.pantalla === 'insPan' ? 'translateX(0)' : 'translateX(103%)', insPanPe: s.pantalla === 'insPan' ? 'auto' : 'none',
      subPend: s.sub === 'pend', subOk: s.sub === 'ok',
      aceptarSub: () => { this.setState({ sub: 'ok' }); this._push('✓', 'Sustitución aceptada', 'Reformer · mañana 11:00 · Nord Pilates — ya está en tu agenda'); },
      rechazarSub: () => { this.setState({ sub: 'no' }); this._toast('Rechazada — se lo proponemos a la siguiente'); },
      ocupacion1930: (6 - this._plazas(this.CAT[2])) + '/6',
      abrirAjustes: () => this.setState({ pantalla: 'ajustes' }),
      cerrarAjustes: () => this.setState({ pantalla: null }),
      ajustesT: s.pantalla === 'ajustes' ? 'translateX(0)' : 'translateX(103%)', ajustesPe: s.pantalla === 'ajustes' ? 'auto' : 'none',
      ajNombre: s.nombre || (this.props.nombreAlumna ?? 'Laura'), onAjNombre: (e) => this.setState({ nombre: e.target.value }),
      ajUsuario: s.ajUsuario, onAjUsuario: (e) => this.setState({ ajUsuario: e.target.value.replace(/\s+/g, '').toLowerCase() }),
      ajEmail: s.ajEmail,
      abrirEmail: () => this.setState({ sheet: 'email', emailPaso: 'form', emailNuevo: '', emailCod: '' }),
      sheetEmailT: s.sheet === 'email' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      emailForm: s.emailPaso === 'form', emailCodPaso: s.emailPaso === 'cod',
      emailNuevo: s.emailNuevo, onEmailNuevo: (e) => this.setState({ emailNuevo: e.target.value }),
      enviarCodEmail: () => { const v = this.state.emailNuevo.trim(); if (!v || !v.includes('@')) { this._toast('Escribe un email válido'); return; } this.setState({ emailPaso: 'cod' }); this._toast('📬 Código enviado a ' + v); },
      emailCod: s.emailCod, onEmailCod: (e) => this.setState({ emailCod: e.target.value }),
      confirmarEmail: () => { if (this.state.emailCod.trim() !== '4729') { this._toast('Código incorrecto — en la demo es 4729'); return; } this.setState(st => ({ ajEmail: st.emailNuevo.trim(), sheet: null })); this._toast('Email actualizado ✓'); },
      abrirPass: () => this.setState({ sheet: 'pass', passA: '', passN: '', passR: '' }),
      sheetPassT: s.sheet === 'pass' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
      passA: s.passA, onPassA: (e) => this.setState({ passA: e.target.value }),
      passN: s.passN, onPassN: (e) => this.setState({ passN: e.target.value }),
      passR: s.passR, onPassR: (e) => this.setState({ passR: e.target.value }),
      passFuerza: s.passN.length >= 12 ? 'fuerte' : s.passN.length >= 8 ? 'aceptable' : s.passN.length > 0 ? 'corta' : '',
      passFuerzaCss: { fontSize: 10.5, fontWeight: 800, color: s.passN.length >= 12 ? '#2E5A3A' : s.passN.length >= 8 ? '#8A6A25' : '#A04A3C', display: s.passN.length ? 'block' : 'none', margin: '4px 0 0' },
      guardarPass: () => {
        const st0 = this.state;
        if (!st0.passA) { this._toast('Escribe tu contraseña actual'); return; }
        if (st0.passN.length < 8) { this._toast('La nueva debe tener al menos 8 caracteres'); return; }
        if (st0.passN !== st0.passR) { this._toast('Las contraseñas no coinciden'); return; }
        this.setState({ sheet: null }); this._toast('🔒 Contraseña actualizada ✓');
      },
      cambiarFoto: () => this._toast('Selector de foto: en la versión completa'),
      abrirActividad: () => this.setState({ pantalla: 'actividad', sheet: null }),
      cerrarActividad: () => this.setState({ pantalla: null }),
      actividadT: s.pantalla === 'actividad' ? 'translateX(0)' : 'translateX(103%)', actividadPe: s.pantalla === 'actividad' ? 'auto' : 'none',
      anilloOff: Math.round(327 * (1 - Math.min(3, 1 + s.reservas.length) / 3)),
      anilloNum: Math.min(3, 1 + s.reservas.length),
      anilloSub: (3 - Math.min(3, 1 + s.reservas.length)) > 0 ? 'Reserva ' + (3 - Math.min(3, 1 + s.reservas.length)) + ' más y mantienes la racha' : '¡Meta cumplida esta semana! 🔥',
      diasAct: ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((l, i) => {
        const hoyIdx = (new Date().getDay() + 6) % 7;
        const done = i === 0 || (i === hoyIdx && s.reservas.length > 0);
        const hoy = i === hoyIdx;
        return { l, css: { width: 38, height: 46, borderRadius: 13, border: hoy ? '2px solid #1A1A1A' : '1px solid #E5E3DA', background: done ? '#4F8A5B' : '#fff', color: done ? '#fff' : hoy ? '#1A1A1A' : '#98A093', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', transition: 'all .25s' }, tap: () => this._toast(done ? l + ' · Reformer 50 min ✓' : hoy ? 'Hoy — aún sin clase, mira los huecos' : i < hoyIdx ? 'Día de descanso' : 'Sin plan aún — reserva en el horario') };
      }),
      abrirReto: () => this.setState({ sheet: 'logro', logroSel: 'reto' }),
      abrirG1: () => this.setState({ sheet: 'logro', logroSel: 'g1' }),
      abrirG2: () => this.setState({ sheet: 'logro', logroSel: 'g2' }),
      abrirG3: () => this.setState({ sheet: 'logro', logroSel: 'g3' }),
      abrirG4: () => this.setState({ sheet: 'logro', logroSel: 'g4' }),
      logrosAct: this.LOGROS.map(g => {
        const cur = this._logroCur(g.id), done = cur >= g.meta;
        return { ...g, curTxt: Math.min(cur, g.meta) + '/' + g.meta,
          cardCss: { background: done ? '#fff' : '#F6F4EC', border: done ? '1px solid #E5E3DA' : '1px dashed #D9D6C9', borderRadius: 15, padding: '12px 6px', textAlign: 'center', cursor: 'pointer', opacity: done ? 1 : .8, fontFamily: 'inherit', transition: 'transform .2s' },
          eCss: { fontSize: 22, filter: done ? 'none' : 'grayscale(1)' },
          nCss: { margin: '5px 0 0', fontSize: 9, fontWeight: 800, lineHeight: 1.25, color: done ? '#1A1A1A' : '#98A093' },
          abrir: () => this.setState({ sheet: 'logro', logroSel: g.id }) };
      }),
      ...(() => {
        const reto = s.logroSel === 'reto';
        const g = reto ? { e: '🏅', n: 'Reto de agosto', d: 'Completa 5 clases este mes y entras en el sorteo de una sesión privada con Marta.', meta: 5 } : (this.LOGROS.find(x => x.id === s.logroSel) || this.LOGROS[0]);
        const cur = this._logroCur(s.logroSel || 'g1'), done = cur >= g.meta;
        return {
          sheetLogroT: s.sheet === 'logro' ? 'translateY(' + s.shY + 'px)' : 'translateY(110%)',
          logroE: g.e, logroN: g.n, logroD: g.d,
          logroECss: { fontSize: 44, display: 'inline-block', filter: done ? 'none' : 'grayscale(.7)', animation: 'apPop .5s both' },
          logroTxt: Math.min(cur, g.meta) + ' de ' + g.meta,
          logroBarra: { width: Math.min(100, cur / g.meta * 100) + '%', height: '100%', background: done ? '#4F8A5B' : '#C99A3C', borderRadius: 99, transition: 'width .7s cubic-bezier(.2,.7,0,1)' },
          logroEstado: done ? 'Conseguido ✓' : 'En curso',
          logroEstadoCss: { display: 'inline-block', marginTop: 10, fontSize: 11, fontWeight: 800, padding: '6px 14px', borderRadius: 999, background: done ? '#EAF0E7' : '#F6EEDD', color: done ? '#2E5A3A' : '#8A6A25' }
        };
      })(),
      tglRec: () => this.setState(st => ({ tRec: st.tRec === false ? true : false })),
      tglPlz: () => this.setState(st => ({ tPlz: st.tPlz === false ? true : false })),
      tglNews: () => this.setState(st => ({ tNews: !st.tNews })),
      tglRecCss: this._tgl(s.tRec !== false), tglRecKnob: this._knob(s.tRec !== false),
      tglPlzCss: this._tgl(s.tPlz !== false), tglPlzKnob: this._knob(s.tPlz !== false),
      tglNewsCss: this._tgl(!!s.tNews), tglNewsKnob: this._knob(!!s.tNews),
      ptrH: s.ptr + 'px', ptrTrans: this._ptrOn ? 'none' : 'height .35s cubic-bezier(.2,.7,0,1)',
      ptrSpin: { fontSize: 17, color: '#5A5A52', marginBottom: 6, display: 'inline-block', opacity: s.ptr > 8 ? 1 : 0, transform: 'rotate(' + (s.ptr * 4) + 'deg)', animation: s.refrescando ? 'apSpin .8s linear infinite' : 'none' }
    };
  }
  _skel() { clearTimeout(this._tc); this._tc = setTimeout(() => this.setState({ cargando: false }), 430); }
  componentDidMount() { this._ts = setTimeout(() => this.setState(st => st.fase === 'splash' ? { fase: 'slides' } : null), 1600); }
  componentWillUnmount() { [this._tc, this._tk, this._tt, this._tl, this._tn, this._ts, this._tp, this._tpg, this._tsu, this._tr, this._trm, this._tpa, this._tch].forEach(clearTimeout); clearInterval(this._tcr); clearInterval(this._tof); }
}


Component.prototype.render = function () {
  const V = this.renderVals();
  return (<React.Fragment>
    <style>{CSS}</style>
    <div style={{position:'relative',height:'100%',overflow:'hidden'}}>

<div style={S("position:relative;height:100%;background:#FAF9F5;display:flex;flex-direction:column;overflow:hidden;font-family:var(--font-jakarta),system-ui,sans-serif")}>

  
  {(V.enOnb) ? <React.Fragment>
  <div style={S("position:absolute;inset:0;z-index:80;background:#0C0C0C;display:flex;flex-direction:column;overflow:hidden")}>
    <div style={S("position:absolute;inset:0;overflow:hidden;z-index:-1")} aria-hidden="true">
      <img src="/assets/foto-hero.jpg" alt="" style={S("width:100%;height:100%;object-fit:cover;object-position:center 30%;animation:apKen 22s ease-in-out infinite")} />
      <div style={S("position:absolute;inset:0;background:linear-gradient(185deg,rgba(8,8,8,.62),rgba(8,8,8,.12) 34%,rgba(8,8,8,.06) 48%,rgba(8,8,8,.9) 82%)")}></div>
    </div>
    {(V.obSplash) ? <React.Fragment>
      <div style={S("flex:1;display:flex;align-items:center;justify-content:center;background:rgba(8,8,8,.3)")}>
        <img src="/assets/logo-h-blanco.svg" alt="Tentare" style={S("height:34px;animation:apPop .8s cubic-bezier(.34,1.4,.5,1) both")} />
      </div>
    </React.Fragment> : null}
    {(V.obSlides) ? <React.Fragment>
      <div style={S("position:relative;flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding:0 24px 36px;color:#FAF9F5")}>
        <img src="/assets/logo-h-blanco.svg" alt="Tentare" style={S("position:absolute;top:64px;left:24px;height:22px;animation:apFade .6s both")} />
        <p style={S("margin:0 0 14px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#A8D0A9;animation:apUp .6s .1s both")}>Studio Alma · Barcelona</p>
        <h1 style={S("margin:0;font-size:46px;font-weight:800;letter-spacing:-.04em;line-height:.98;animation:apUp .7s .18s both")}>Muévete.<br />Lo demás,<br />ya está.</h1>
        <p style={S("margin:16px 0 0;font-size:14.5px;line-height:1.55;color:rgba(250,249,245,.78);max-width:30ch;animation:apUp .7s .3s both")}>Reserva, bono y acceso a tu estudio en una sola app.</p>
        <button type="button" onClick={V.avanzarSlide} style={S("width:100%;height:56px;margin-top:26px;border:none;border-radius:999px;background:#FAF9F5;color:#0C0C0C;font-family:inherit;font-size:16px;font-weight:800;cursor:pointer;animation:apUp .7s .42s both")}>Empezar</button>
        <button type="button" onClick={V.avanzarSlide} style={S("width:100%;margin-top:14px;border:none;background:none;font-family:inherit;font-size:13.5px;font-weight:700;color:rgba(250,249,245,.85);cursor:pointer;animation:apUp .7s .5s both")}>Ya tengo cuenta</button>
      </div>
    </React.Fragment> : null}
    {(V.obReg) ? <React.Fragment>
      <div style={S("flex:1;display:flex;flex-direction:column;justify-content:flex-end")}>
        <div style={S("background:#FAF9F5;border-radius:28px 28px 0 0;padding:26px 24px 34px;animation:apUp .45s cubic-bezier(.3,.9,.2,1) both")}>
          <h2 style={S("margin:0;font-size:24px;font-weight:800;letter-spacing:-.03em")}>Crea tu cuenta</h2>
          <p style={S("margin:5px 0 18px;font-size:12.5px;color:#5A5A52")}>Treinta segundos y estás dentro.</p>
          <button type="button" onClick={V.regSocial} style={S("width:100%;height:52px;border:none;border-radius:999px;background:#0C0C0C;color:#FAF9F5;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer")}> Continuar con Apple</button>
          <button type="button" onClick={V.regSocial} style={S("width:100%;height:52px;margin-top:10px;border:1.5px solid #D9D6C9;border-radius:999px;background:#fff;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer")}>G&nbsp;&nbsp;Continuar con Google</button>
          <div style={S("display:flex;align-items:center;gap:10px;margin:16px 0")}><span style={S("flex:1;height:1px;background:#E5E3DA")}></span><span style={S("font-size:11px;color:#98A093")}>o con tu email</span><span style={S("flex:1;height:1px;background:#E5E3DA")}></span></div>
          <input value={V.regNombre} onChange={V.onRegNombre} placeholder="Tu nombre" style={S("width:100%;box-sizing:border-box;background:#fff;border:1.5px solid #D9D6C9;border-radius:14px;padding:14px 16px;font-family:inherit;font-size:15px;font-weight:600;color:#1A1A1A")} />
          <input placeholder="tu@email.com" style={S("width:100%;box-sizing:border-box;margin-top:9px;background:#fff;border:1.5px solid #D9D6C9;border-radius:14px;padding:14px 16px;font-family:inherit;font-size:15px;font-weight:600;color:#1A1A1A")} />
          <button type="button" onClick={V.regContinuar} style={S("width:100%;height:52px;margin-top:10px;border:none;border-radius:999px;background:#3E6B4A;color:#FAF9F5;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer")}>Continuar</button>
          <p style={S("margin:14px 0 0;text-align:center;font-size:10.5px;color:#98A093")}>Al continuar aceptas los términos y la privacidad.</p>
        </div>
      </div>
    </React.Fragment> : null}
    {(V.obPerm) ? <React.Fragment>
      <div style={S("flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 24px;animation:apFade .3s both")}>
        <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:22px;padding:26px;text-align:center;box-shadow:0 24px 60px -24px rgba(26,26,26,.25);animation:apPop .45s both")}>
          <span style={S("font-size:38px")}>📍</span>
          <h2 style={S("margin:12px 0 0;font-size:21px;font-weight:800;letter-spacing:-.025em")}>¿Dónde entrenas?</h2>
          <p style={S("margin:8px 0 0;font-size:13px;line-height:1.55;color:#5A5A52")}>Con tu ubicación te enseñamos clases y estudios cerca de ti — nada más.</p>
          <button type="button" onClick={V.permitirUbi} style={S("width:100%;height:50px;margin-top:18px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer")}>Permitir ubicación</button>
          <button type="button" onClick={V.saltarUbi} style={S("width:100%;height:44px;margin-top:8px;border:none;border-radius:999px;background:#EFEDE4;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer")}>Ahora no</button>
        </div>
      </div>
    </React.Fragment> : null}
    {(V.obNoti) ? <React.Fragment>
      <div style={S("flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 24px;animation:apFade .3s both")}>
        <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:22px;padding:26px;text-align:center;box-shadow:0 24px 60px -24px rgba(26,26,26,.25);animation:apPop .45s both")}>
          <span style={S("font-size:38px")}>🔔</span>
          <h2 style={S("margin:12px 0 0;font-size:21px;font-weight:800;letter-spacing:-.025em")}>Lo importante, al momento</h2>
          <p style={S("margin:8px 0 0;font-size:13px;line-height:1.55;color:#5A5A52")}>Plazas liberadas de tu lista de espera y recordatorios de clase. Sin spam.</p>
          <button type="button" onClick={V.permitirNoti} style={S("width:100%;height:50px;margin-top:18px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer")}>Permitir avisos</button>
          <button type="button" onClick={V.saltarNoti} style={S("width:100%;height:44px;margin-top:8px;border:none;border-radius:999px;background:#EFEDE4;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer")}>Ahora no</button>
        </div>
      </div>
    </React.Fragment> : null}
  </div>
  </React.Fragment> : null}

  
  {(V.hayPush) ? <React.Fragment>
    <div onClick={V.pushTap} style={S("position:absolute;top:52px;left:10px;right:10px;z-index:96;display:flex;gap:10px;align-items:center;background:rgba(250,249,245,.97);backdrop-filter:blur(14px);border:1px solid rgba(26,26,26,.08);border-radius:18px;padding:11px 14px;box-shadow:0 18px 44px rgba(15,15,15,.3);cursor:pointer;animation:apSlideDown .5s cubic-bezier(.34,1.3,.5,1) both")}>
      <span style={S("width:34px;height:34px;flex-shrink:0;border-radius:9px;background:#1A1A1A;display:flex;align-items:center;justify-content:center;font-size:16px")}>{V.pushEmoji}</span>
      <span style={S("flex:1;min-width:0")}><span style={S("display:flex;justify-content:space-between;gap:8px")}><span style={S("font-size:12.5px;font-weight:800")}>{V.pushT}</span><span style={S("font-size:10px;color:#98A093")}>ahora</span></span><span style={S("display:block;font-size:11.5px;color:#5A5A52;margin-top:1px")}>{V.pushC}</span></span>
    </div>
  </React.Fragment> : null}

  
  {(V.hayToast) ? <React.Fragment>
    <div style={S("position:absolute;top:58px;left:16px;right:16px;z-index:95;display:flex;justify-content:center;pointer-events:none")}>
      <div style={S("display:flex;align-items:center;gap:8px;background:#1A1A1A;color:#F1ECE1;border-radius:999px;padding:10px 18px;font-size:12.5px;font-weight:700;box-shadow:0 14px 34px rgba(15,15,15,.35);animation:apToast .35s cubic-bezier(.34,1.4,.5,1) both")}>{V.toastMsg}</div>
    </div>
  </React.Fragment> : null}

  
  {(V.esHoy) ? <React.Fragment>
  <div ref={V.hoyRef} onPointerDown={V.ptrPD} onPointerMove={V.ptrPM} onPointerUp={V.ptrPU} style={S("flex:1;overflow-y:auto;padding:56px 0 92px")}>
    <div style={S(`height:${V.ptrH};display:flex;align-items:flex-end;justify-content:center;overflow:hidden;transition:${V.ptrTrans}`)}>
      <span style={V.ptrSpin}>↻</span>
    </div>
    <div style={S("position:relative;height:314px;margin-top:-56px;overflow:hidden;animation:apFade .45s both")}>
      <img src="/assets/foto-hero.jpg" alt="" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 32%;animation:apKen 22s ease-in-out infinite")} />
      <div style={S("position:absolute;inset:0;background:linear-gradient(185deg,rgba(8,8,8,.58),rgba(8,8,8,.18) 42%,rgba(8,8,8,.06) 58%,rgba(250,249,245,.35) 86%,#FAF9F5)")} aria-hidden="true"></div>
      <div style={S("position:absolute;left:18px;right:18px;top:64px;color:#FAF9F5")}>
        <div style={S("display:flex;justify-content:space-between;align-items:flex-start")}>
          <div>
            <p style={S("margin:0 0 4px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:#A8D0A9")}>Studio Alma · by Tentare</p>
            <p style={S("margin:0 0 10px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:rgba(250,249,245,.65)")}>{V.fechaHoy}</p>
            <p style={S("margin:0;font-size:13px;font-weight:700;color:rgba(250,249,245,.9)")}>{V.saludo}, {V.nombre} 👋</p>
            <h2 style={S("margin:3px 0 0;font-weight:800;font-size:32px;letter-spacing:-.035em;line-height:1")}>¿Qué te apetece<br />hoy?</h2>
          </div>
          <button type="button" onClick={V.abrirNotifs} aria-label="Notificaciones" style={S("position:relative;width:40px;height:40px;flex-shrink:0;border:1px solid rgba(255,255,255,.45);border-radius:999px;background:rgba(250,249,245,.22);backdrop-filter:blur(8px);cursor:pointer;font-size:15px")}>🔔
            {(V.notifDot) ? <React.Fragment><span style={S("position:absolute;top:8px;right:9px;width:8px;height:8px;border-radius:99px;background:#E8A13C;border:1.5px solid #fff;animation:apDot .4s both")}></span></React.Fragment> : null}
          </button>
        </div>
        <button type="button" onClick={V.abrirBuscar} style={S("width:100%;margin-top:16px;display:flex;align-items:center;gap:9px;background:rgba(250,249,245,.94);backdrop-filter:blur(10px);border:none;border-radius:999px;padding:13px 16px;font-family:inherit;font-size:13.5px;color:#5A5A52;cursor:pointer;box-shadow:0 10px 26px rgba(8,8,8,.22)")}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#5A5A52" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><line x1="16" y1="16" x2="21" y2="21"></line></svg>
          Buscar clases, instructoras…
        </button>
      </div>
    </div>
    {(V.hayReserva) ? <React.Fragment>
      <div style={S("position:relative;margin:13px 18px 0;border-radius:20px;padding:14px 15px;overflow:hidden;animation:apPop .5s both;box-shadow:0 18px 38px -16px rgba(18,41,26,.5)")}>
        <img src="/assets/foto-reformer.webp" alt="" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} />
        <div style={S("position:absolute;inset:0;background:linear-gradient(100deg,rgba(18,41,26,.95),rgba(18,41,26,.68))")} aria-hidden="true"></div>
        <div style={S("position:relative;color:#EAF0E7")}>
        <div style={S("display:flex;justify-content:space-between;align-items:center")}>
          <p style={S("margin:0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#A8D0A9")}>Tu próxima clase</p>
          <span style={S("display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;color:#A8D0A9")}><span style={S("width:6px;height:6px;border-radius:99px;background:#7BC488;animation:apPulse 2s infinite")}></span>{V.proxDia}</span>
        </div>
        <p style={S("margin:5px 0 0;font-size:15.5px;font-weight:800;letter-spacing:-.02em;color:#FAF9F5")}>{V.proxTxt}</p>
        <div style={S("display:flex;gap:7px;margin-top:9px")}>
          <button type="button" onClick={V.abrirPase} style={S("display:flex;align-items:center;gap:7px;border:none;background:#FAF9F5;color:#12291A;border-radius:999px;padding:7px 14px;font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer")}><span aria-hidden="true" style={S("display:grid;grid-template-columns:repeat(3,3px);grid-template-rows:repeat(3,3px);gap:2px")}><span style={S("background:#12291A")}></span><span style={S("background:#12291A")}></span><span style={S("background:#12291A;opacity:.35")}></span><span style={S("background:#12291A")}></span><span style={S("background:#12291A;opacity:.35")}></span><span style={S("background:#12291A")}></span><span style={S("background:#12291A;opacity:.35")}></span><span style={S("background:#12291A")}></span><span style={S("background:#12291A")}></span></span>Ver mi acceso</button>
          <button type="button" onClick={V.tComoLlegar} style={S("border:1px solid rgba(234,240,231,.35);background:rgba(234,240,231,.12);color:#EAF0E7;border-radius:999px;padding:7px 13px;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer")}>Cómo llegar</button>
          <button type="button" onClick={V.tCalendario} style={S("border:1px solid rgba(234,240,231,.35);background:rgba(234,240,231,.12);color:#EAF0E7;border-radius:999px;padding:7px 13px;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer")}>+ Calendario</button>
        </div>
        </div>
      </div>
    </React.Fragment> : null}
    <p style={S("margin:26px 18px 9px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#98A093;animation:apUp .45s .06s both")}>Tu ritmo</p>
    <div style={S("margin:0 18px 0;display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #E5E3DA;border-radius:16px;padding:12px 15px;animation:apUp .45s .08s both;transition:box-shadow .25s")}>
      <p style={S("margin:0;font-size:12.5px;font-weight:700")}>Bono 5 sesiones</p>
      <div style={S("display:flex;align-items:center;gap:8px")}>
        <div style={S("width:66px;height:5px;border-radius:99px;background:#EFEDE4;overflow:hidden")}><div style={V.bonoBarra}></div></div>
        <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:11px;color:#3E6B4A")}>quedan {V.bono}</span>
      </div>
    </div>
    <div onClick={V.abrirActividad} style={S("margin:10px 18px 0;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E5E3DA;border-radius:16px;padding:11px 15px;cursor:pointer;animation:apUp .45s .14s both;transition:box-shadow .25s")}>
      <span style={S("font-size:11px;font-weight:800;color:#5A5A52;flex-shrink:0")}>Tu semana</span>
      <div style={S("flex:1;display:flex;justify-content:space-between")}>
        {((V.semana)||[]).map((d, $index) => (<React.Fragment key={$index}>
          <span style={S("display:flex;flex-direction:column;align-items:center;gap:4px")}><span style={S("font-size:8.5px;font-weight:700;color:#98A093")}>{d.l}</span><span style={d.css}></span></span>
        </React.Fragment>))}
      </div>
      <span style={S("font-size:10.5px;font-weight:800;color:#C99A3C;flex-shrink:0")}>🔥 3 sem.</span>
    </div>
    {(V.bloqueProgreso) ? <React.Fragment>
    <div style={S("margin:10px 18px 0;display:flex;gap:10px;animation:apUp .45s .2s both")}>
      <div onClick={V.abrirActividad} style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:16px;padding:12px 14px;cursor:pointer;transition:box-shadow .25s")}>
        <div style={S("display:flex;justify-content:space-between;align-items:baseline")}><p style={S("margin:0;font-size:11.5px;font-weight:800")}>Mi progreso</p><span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:9.5px;color:#98A093")}>meta 3/sem</span></div>
        <p style={S("margin:4px 0 6px;font-size:12px;color:#5A5A52")}><b style={S("color:#1A1A1A")}>{V.progresoTxt}</b> esta semana</p>
        <div style={S("height:5px;border-radius:99px;background:#EFEDE4;overflow:hidden")}><div style={V.progresoBarra}></div></div>
      </div>
      <div onClick={V.abrirReto} style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:16px;padding:12px 14px;cursor:pointer;transition:box-shadow .25s")}>
        <div style={S("display:flex;justify-content:space-between;align-items:baseline")}><p style={S("margin:0;font-size:11.5px;font-weight:800")}>Reto de agosto</p><span style={S("font-size:11px")}>🏅</span></div>
        <p style={S("margin:4px 0 6px;font-size:12px;color:#5A5A52")}><b style={S("color:#1A1A1A")}>{V.retoTxt}</b> clases</p>
        <div style={S("height:5px;border-radius:99px;background:#EFEDE4;overflow:hidden")}><div style={V.retoBarra}></div></div>
      </div>
    </div>
    </React.Fragment> : null}
    {(V.bloqueInvita) ? <React.Fragment>
    <div onClick={V.invitar} style={S("position:relative;margin:26px 18px 0;height:112px;border-radius:18px;overflow:hidden;cursor:pointer;animation:apUp .45s .26s both;box-shadow:0 14px 30px -14px rgba(15,15,15,.35)")}>
      <img src="/assets/foto-clase.webp" alt="" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} />
      <div style={S("position:absolute;inset:0;background:linear-gradient(90deg,rgba(15,15,15,.68),rgba(15,15,15,.12))")} aria-hidden="true"></div>
      <div style={S("position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;padding:0 16px")}>
        <div style={S("color:#fff")}><p style={S("margin:0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.75)")}>Trae a alguien</p><p style={S("margin:3px 0 0;font-size:16px;font-weight:800;letter-spacing:-.02em;font-style:italic")}>Invita a una amiga —<br />su primera clase, gratis.</p></div>
        <span style={S("width:38px;height:38px;flex-shrink:0;border-radius:999px;background:#FAF9F5;color:#1A1A1A;display:flex;align-items:center;justify-content:center;font-size:16px")}>→</span>
      </div>
    </div>
    </React.Fragment> : null}
    <div style={S("display:flex;justify-content:space-between;align-items:flex-end;padding:30px 18px 11px;animation:apUp .5s .3s both")}>
      <div><p style={S("margin:0 0 3px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#98A093")}>El espacio</p><h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.025em")}>Tu estudio</h3></div>
      <button type="button" onClick={V.irExplorar} style={S("border:none;background:none;font-family:inherit;font-size:12px;font-weight:800;color:#3E6B4A;cursor:pointer;padding:0 0 2px")}>Ver horario →</button>
    </div>
    <div style={S("display:flex;gap:12px;overflow-x:auto;padding:0 18px 8px;animation:apUp .5s .1s both")}>
      <div onClick={V.abrirAlma} style={S("position:relative;min-width:236px;height:280px;border-radius:20px;overflow:hidden;cursor:pointer;box-shadow:0 14px 30px -12px rgba(26,26,26,.3)")}>
        <div style={S("position:absolute;inset:0;overflow:hidden")}><img src="/assets/foto-reformer.webp" alt="Studio Alma" style={S("width:100%;height:100%;object-fit:cover;animation:apKen 16s ease-in-out infinite")} /></div>
        <div style={S("position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(15,15,15,.64))")} aria-hidden="true"></div>
        <button type="button" onClick={V.favAlma} aria-label="Guardar" style={S(`position:absolute;top:11px;right:11px;width:32px;height:32px;border:none;border-radius:999px;background:rgba(250,249,245,.92);cursor:pointer;font-size:15px;line-height:1;${V.favAlmaCss}`)}>{V.favAlmaIco}</button>
        <span style={S("position:absolute;top:11px;left:11px;background:rgba(250,249,245,.92);border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:800;color:#2E5A3A")}>hoy 19:30 · {V.plazasC2}</span>
        <div style={S("position:absolute;left:13px;right:13px;bottom:11px;color:#fff")}>
          <p style={S("margin:0;font-size:17px;font-weight:800;letter-spacing:-.02em")}>Studio Alma</p>
          <p style={S("margin:2px 0 0;font-size:11.5px;color:rgba(255,255,255,.85)")}>★ 4,9 · Gràcia · 1,2 km · Reformer</p>
          <div style={S("display:flex;justify-content:space-between;align-items:center;margin-top:8px")}>
            <span style={S("font-size:13.5px;font-weight:800")}>18 €</span>
            <span style={S("background:#FAF9F5;color:#1A1A1A;border-radius:999px;padding:7px 14px;font-size:11.5px;font-weight:800")}>Ver clases</span>
          </div>
        </div>
      </div>
      <div onClick={V.abrirMarta} style={S("position:relative;min-width:236px;height:280px;border-radius:20px;overflow:hidden;cursor:pointer;box-shadow:0 14px 30px -12px rgba(26,26,26,.3)")}>
        <img src="/assets/foto-pilates.jpg" alt="Marta G." style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} />
        <div style={S("position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(15,15,15,.64))")} aria-hidden="true"></div>
        <span style={S("position:absolute;top:11px;left:11px;background:rgba(250,249,245,.92);border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:800;color:#2E5A3A")}>Tu equipo</span>
        <div style={S("position:absolute;left:13px;right:13px;bottom:11px;color:#fff")}>
          <p style={S("margin:0;font-size:17px;font-weight:800;letter-spacing:-.02em")}>Conoce a Marta</p>
          <p style={S("margin:2px 0 0;font-size:11.5px;color:rgba(255,255,255,.85)")}>★ 4,9 · Reformer, Prenatal · da tu clase de hoy</p>
          <div style={S("display:flex;justify-content:flex-end;margin-top:8px")}>
            <span style={S("background:rgba(250,249,245,.26);border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:7px 14px;font-size:11.5px;font-weight:800")}>Su perfil</span>
          </div>
        </div>
      </div>
    </div>
    <div style={S("display:flex;justify-content:space-between;align-items:flex-end;padding:30px 18px 11px")}>
      <div><p style={S("margin:0 0 3px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#98A093")}>Últimas plazas</p><h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.025em")}>Huecos de hoy</h3></div>
      <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;color:#98A093;padding-bottom:3px")}>según tu bono</span>
    </div>
    <div style={S("padding:0 18px;display:flex;flex-direction:column;gap:8px;animation:apUp .5s .14s both")}>
      {((V.huecosHoy)||[]).map((c, $index) => (<React.Fragment key={$index}>
        <div onClick={c.abrir} style={S(`display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:15px;padding:10px 13px;cursor:pointer;animation:apUp .4s both;animation-delay:${c.delay};transition:box-shadow .25s`)}>
          <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:13px;font-weight:500;color:#1A1A1A;min-width:40px")}>{c.hora}</span>
          <span aria-hidden="true" style={S(`width:34px;height:34px;border-radius:999px;flex-shrink:0;background-image:url(${c.avatar});background-size:cover;background-position:center`)}></span>
          <div style={S("flex:1;min-width:0")}>
            <p style={S("margin:0;font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{c.nombre}</p>
            <p style={S("margin:1px 0 0;font-size:11px;color:#5A5A52")}>{c.inst} · {c.estudio}</p>
          </div>
          <span style={c.badgeCss}>{c.badge}</span>
        </div>
      </React.Fragment>))}
    </div>
    <div style={S("padding:30px 18px 11px")}>
      <p style={S("margin:0 0 3px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#98A093")}>Tablón</p>
      <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.025em")}>Novedades del estudio</h3>
    </div>
    <div style={S("padding:0 18px;display:flex;flex-direction:column;gap:8px;animation:apUp .5s .12s both")}>
      <div style={S("display:flex;gap:10px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}><span style={S("font-size:14px")}>📣</span><span style={S("flex:1")}><span style={S("display:block;font-size:12px;font-weight:800")}>Horario de verano hasta el 7 de septiembre</span><span style={S("display:block;font-size:10.5px;color:#5A5A52;margin-top:1px")}>Las clases de mediodía pasan a las 12:00 · el sábado abrimos solo mañanas.</span></span></div>
      <div style={S("display:flex;gap:10px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}><span style={S("font-size:14px")}>🗓</span><span style={S("flex:1")}><span style={S("display:block;font-size:12px;font-weight:800")}>Taller de suelo pélvico · sábado 5 oct</span><span style={S("display:block;font-size:10.5px;color:#5A5A52;margin-top:1px")}>Con Marta G. · plazas limitadas — apúntate en recepción.</span></span></div>
    </div>
  </div>
  </React.Fragment> : null}

  
  {(V.esExplorar) ? <React.Fragment>
  <div style={S("flex:1;overflow-y:auto;padding:56px 0 92px;animation:apFade .25s both")}>
    <div style={S("padding:8px 18px 0")}>
      <button type="button" onClick={V.abrirBuscar} style={S("width:100%;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #E5E3DA;border-radius:999px;padding:12px 15px;font-family:inherit;font-size:13.5px;color:#98A093;cursor:pointer")}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#5A5A52" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><line x1="16" y1="16" x2="21" y2="21"></line></svg>
        Buscar clases, instructoras…
      </button>
      <div style={S("position:relative;height:98px;border-radius:18px;overflow:hidden;margin-top:13px")}>
        <img src="/assets/foto-reformer.webp" alt="" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 60%")} />
        <div style={S("position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,8,8,.72),rgba(8,8,8,.18))")} aria-hidden="true"></div>
        <div style={S("position:absolute;left:16px;bottom:12px;color:#FAF9F5")}>
          <p style={S("margin:0 0 3px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#A8D0A9")}>Gràcia · sala 1 y 2</p>
          <h2 style={S("margin:0;font-weight:800;font-size:24px;letter-spacing:-.035em;line-height:1")}>Horario del estudio</h2>
        </div>
      </div>
    </div>
    
    {(V.segEsClases) ? <React.Fragment>
      <div style={S("display:flex;gap:7px;padding:12px 18px 0;overflow-x:auto")}>
        {((V.dias)||[]).map((d, $index) => (<React.Fragment key={$index}>
          <button type="button" onClick={d.sel} style={d.css}>{d.label}<span style={S("display:block;font-size:9.5px;font-weight:600;opacity:.72")}>{d.sub}</span></button>
        </React.Fragment>))}
        <span style={S("flex:1")}></span>

      </div>
      <div style={S("display:flex;gap:7px;padding:10px 18px 0")}>
        <button type="button" onClick={V.fTodo} style={V.fTodoCss}>Todo</button>
        <button type="button" onClick={V.fReformer} style={V.fReformerCss}>Reformer</button>
        <button type="button" onClick={V.fMat} style={V.fMatCss}>Mat</button>
        <button type="button" onClick={V.fPrecio} style={V.fPrecioCss}>Con hueco</button>
      </div>
      <p style={S("margin:11px 18px 0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#98A093")}>{V.nClases} clases · {V.diaLabel}</p>
      {(V.vistaLista) ? <React.Fragment>
        <div style={S("padding:9px 18px 0;display:flex;flex-direction:column;gap:9px")}>
          {((V.clases)||[]).map((c, $index) => (<React.Fragment key={$index}>
            <div onClick={c.abrir} style={S(`display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #E5E3DA;border-radius:16px;padding:12px 14px;cursor:pointer;animation:apUp .4s both;animation-delay:${c.delay}`)}>
              <div style={S("text-align:center;min-width:46px")}>
                <p style={S("margin:0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:14px;font-weight:500")}>{c.hora}</p>
                <p style={S("margin:1px 0 0;font-size:9.5px;color:#98A093")}>{c.dur} min</p>
              </div>
              <div style={S("width:1px;align-self:stretch;background:#EFEDE4")} aria-hidden="true"></div>
              <div style={S("flex:1;min-width:0")}>
                <p style={S("margin:0;font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{c.nombre}</p>
                <div style={S("display:flex;align-items:center;gap:6px;margin-top:3px")}>
                  <span role="img" aria-label={c.inst} style={S(`width:20px;height:20px;border-radius:999px;flex-shrink:0;background-image:url(${c.avatar});background-size:cover;background-position:center`)}></span>
                  <p style={S("margin:0;font-size:11px;color:#5A5A52")}>{c.inst} · {c.estudio}</p>
                </div>
              </div>
              <div style={S("text-align:right")}>
                <span style={c.badgeCss}>{c.badge}</span>
                <p style={S("margin:5px 0 0;font-size:11.5px;font-weight:800;color:#5A5A52")}>{c.precioTxt}</p>
              </div>
            </div>
          </React.Fragment>))}
        </div>
      </React.Fragment> : null}
      {(V.vistaMapa) ? <React.Fragment>
        <div style={S("position:relative;margin:9px 18px 0;height:400px;border-radius:20px;overflow:hidden;background:#EDEBE1;animation:apFade .3s both")}>
          <svg viewBox="0 0 340 400" style={S("position:absolute;inset:0;width:100%;height:100%")} aria-hidden="true">
            <path d="M-10 75 C 60 65, 120 90, 180 80 S 300 55, 360 70" stroke="#DDD9CB" strokeWidth="10" fill="none"></path>
            <path d="M-10 180 C 80 170, 150 195, 230 185 S 330 165, 370 175" stroke="#DDD9CB" strokeWidth="14" fill="none"></path>
            <path d="M-10 300 C 70 290, 160 315, 240 302 S 340 285, 380 295" stroke="#DDD9CB" strokeWidth="8" fill="none"></path>
            <path d="M70 -10 C 65 90, 85 200, 75 300 S 70 380, 78 420" stroke="#DDD9CB" strokeWidth="9" fill="none"></path>
            <path d="M210 -10 C 205 100, 220 210, 212 320 S 208 380, 214 420" stroke="#DDD9CB" strokeWidth="12" fill="none"></path>
            <rect x="245" y="205" width="70" height="52" rx="10" fill="#E2EDE0"></rect>
            <rect x="24" y="100" width="58" height="44" rx="10" fill="#E2EDE0"></rect>
          </svg>
          <button type="button" onClick={V.selPin1} style={S(`position:absolute;top:30%;left:23%;border:none;background:${V.pin1Bg};color:${V.pin1Fg};border-radius:999px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(26,26,26,.25);transition:all .2s`)}>Alma · 18 €</button>
          <button type="button" onClick={V.selPin2} style={S(`position:absolute;top:52%;left:56%;border:none;background:${V.pin2Bg};color:${V.pin2Fg};border-radius:999px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(26,26,26,.25);transition:all .2s`)}>Llum · 15 €</button>
          <button type="button" onClick={V.selPin3} style={S(`position:absolute;top:71%;left:34%;border:none;background:${V.pin3Bg};color:${V.pin3Fg};border-radius:999px;padding:7px 12px;font-family:inherit;font-size:12px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(26,26,26,.25);transition:all .2s`)}>Nord · 17 €</button>
          <span style={S("position:absolute;top:44%;left:41%;width:14px;height:14px;border-radius:999px;background:#4C9CB0;border:3px solid #fff;box-shadow:0 0 0 6px rgba(76,156,176,.22);animation:apPulse 2.4s infinite")} aria-hidden="true"></span>
          <span style={S("position:absolute;top:11px;left:11px;background:rgba(250,249,245,.94);border-radius:999px;padding:5px 11px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#5A5A52")}>gràcia – eixample</span>
          <div style={S("position:absolute;left:10px;right:10px;bottom:10px")}>
            <div style={S("display:flex;justify-content:center;margin-bottom:7px")}>
              <button type="button" onClick={V.alternarMapaExt} style={S("border:none;background:rgba(250,249,245,.95);border-radius:999px;padding:6px 14px;font-family:inherit;font-size:10.5px;font-weight:800;cursor:pointer;box-shadow:0 8px 22px rgba(26,26,26,.22)")}>{V.mapaExtTxt}</button>
            </div>
            <div onClick={V.pinAbrir} style={S("display:flex;gap:11px;background:#FAF9F5;border-radius:16px;padding:9px;cursor:pointer;box-shadow:0 18px 40px rgba(26,26,26,.3);animation:apUp .35s both")}>
              <div aria-hidden="true" style={S(`width:70px;height:70px;flex-shrink:0;border-radius:11px;background-image:url('${V.pinFoto}');background-size:cover;background-position:center`)}></div>
              <div style={S("flex:1;min-width:0;align-self:center")}>
                <p style={S("margin:0;font-size:13.5px;font-weight:800")}>{V.pinNombre}</p>
                <p style={S("margin:2px 0 0;font-size:11px;color:#5A5A52")}>{V.pinMeta}</p>
                <p style={S("margin:3px 0 0;font-size:11px;font-weight:800;color:#2E5A3A")}>{V.pinClase}</p>
              </div>
              <span style={S("align-self:center;background:#1A1A1A;color:#F1ECE1;border-radius:999px;padding:8px 13px;font-size:11px;font-weight:800")}>Ver</span>
            </div>
            {(V.mapaExtOn) ? <React.Fragment>
              <div style={S("display:flex;flex-direction:column;gap:6px;margin-top:6px")}>
                <div onClick={V.mapaOtro1} style={S("display:flex;justify-content:space-between;align-items:center;background:rgba(250,249,245,.96);border-radius:13px;padding:9px 13px;cursor:pointer;animation:apUp .3s both")}><span style={S("font-size:12px;font-weight:800")}>{V.otro1Nombre}</span><span style={S("font-size:10.5px;color:#5A5A52")}>{V.otro1Meta}</span></div>
                <div onClick={V.mapaOtro2} style={S("display:flex;justify-content:space-between;align-items:center;background:rgba(250,249,245,.96);border-radius:13px;padding:9px 13px;cursor:pointer;animation:apUp .3s .06s both")}><span style={S("font-size:12px;font-weight:800")}>{V.otro2Nombre}</span><span style={S("font-size:10.5px;color:#5A5A52")}>{V.otro2Meta}</span></div>
              </div>
            </React.Fragment> : null}
          </div>
        </div>
      </React.Fragment> : null}
    </React.Fragment> : null}
    
    {(V.segEsEstudios) ? <React.Fragment>
      <div style={S("padding:12px 18px 0;display:flex;flex-direction:column;gap:13px")}>
        <div onClick={V.abrirAlma} style={S("position:relative;height:236px;border-radius:20px;overflow:hidden;cursor:pointer;animation:apUp .4s both;box-shadow:0 14px 30px -14px rgba(26,26,26,.28)")}>
          <img src="/assets/foto-reformer.webp" alt="Studio Alma" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} />
          <div style={S("position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(15,15,15,.6))")} aria-hidden="true"></div>
          <button type="button" onClick={V.favAlma} aria-label="Guardar" style={S(`position:absolute;top:11px;right:11px;width:32px;height:32px;border:none;border-radius:999px;background:rgba(250,249,245,.92);cursor:pointer;font-size:15px;line-height:1;${V.favAlmaCss}`)}>{V.favAlmaIco}</button>
          <div style={S("position:absolute;left:13px;right:13px;bottom:11px;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;gap:10px")}>
            <div>
              <p style={S("margin:0;font-size:16.5px;font-weight:800;letter-spacing:-.02em")}>Studio Alma <span style={S("font-size:11.5px;font-weight:700")}>★ 4,9</span></p>
              <p style={S("margin:2px 0 0;font-size:11.5px;color:rgba(255,255,255,.85)")}>Gràcia · 1,2 km · Reformer · Mat · <b style={S("color:#fff")}>hoy 19:30</b></p>
            </div>
            <span style={S("background:#FAF9F5;color:#1A1A1A;border-radius:999px;padding:7px 13px;font-size:11.5px;font-weight:800")}>Ver</span>
          </div>
        </div>
        <div onClick={V.abrirLlum} style={S("position:relative;height:236px;border-radius:20px;overflow:hidden;cursor:pointer;animation:apUp .4s .07s both;box-shadow:0 14px 30px -14px rgba(26,26,26,.28)")}>
          <img src="/assets/foto-estudio.webp" alt="Espai Llum" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} />
          <div style={S("position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(15,15,15,.6))")} aria-hidden="true"></div>
          <button type="button" onClick={V.favLlum} aria-label="Guardar" style={S(`position:absolute;top:11px;right:11px;width:32px;height:32px;border:none;border-radius:999px;background:rgba(250,249,245,.92);cursor:pointer;font-size:15px;line-height:1;${V.favLlumCss}`)}>{V.favLlumIco}</button>
          <div style={S("position:absolute;left:13px;right:13px;bottom:11px;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;gap:10px")}>
            <div>
              <p style={S("margin:0;font-size:16.5px;font-weight:800;letter-spacing:-.02em")}>Espai Llum <span style={S("font-size:11.5px;font-weight:700")}>★ 4,8</span></p>
              <p style={S("margin:2px 0 0;font-size:11.5px;color:rgba(255,255,255,.85)")}>Eixample · 2,1 km · Mat · Yoga · hoy 19:00</p>
            </div>
            <span style={S("background:rgba(250,249,245,.26);border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:7px 13px;font-size:11.5px;font-weight:800")}>Ver</span>
          </div>
        </div>
        <div onClick={V.abrirNord} style={S("position:relative;height:236px;border-radius:20px;overflow:hidden;cursor:pointer;animation:apUp .4s .14s both;box-shadow:0 14px 30px -14px rgba(26,26,26,.28)")}>
          <img src="/assets/foto-clase.webp" alt="Nord Pilates" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} />
          <div style={S("position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(15,15,15,.6))")} aria-hidden="true"></div>
          <div style={S("position:absolute;left:13px;right:13px;bottom:11px;color:#fff;display:flex;justify-content:space-between;align-items:flex-end;gap:10px")}>
            <div>
              <p style={S("margin:0;font-size:16.5px;font-weight:800;letter-spacing:-.02em")}>Nord Pilates <span style={S("font-size:11.5px;font-weight:700")}>★ 4,7</span></p>
              <p style={S("margin:2px 0 0;font-size:11.5px;color:rgba(255,255,255,.85)")}>Poblenou · 2,8 km · Reformer · hoy 20:00 · <b style={S("color:#F3C46A")}>1 plaza</b></p>
            </div>
            <span style={S("background:rgba(250,249,245,.26);border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:7px 13px;font-size:11.5px;font-weight:800")}>Ver</span>
          </div>
        </div>
      </div>
    </React.Fragment> : null}
    
    {(V.segEsInst) ? <React.Fragment>
      <div style={S("padding:12px 18px 0;display:flex;flex-direction:column;gap:10px")}>
        <div onClick={V.abrirMarta} style={S("display:flex;gap:12px;background:#fff;border:1px solid #E5E3DA;border-radius:18px;padding:11px;cursor:pointer;animation:apUp .4s both")}>
          <img src="/assets/foto-pilates.jpg" alt="Marta G." style={S("width:66px;height:66px;border-radius:14px;object-fit:cover")} />
          <div style={S("flex:1;min-width:0")}>
            <p style={S("margin:0;font-size:14px;font-weight:800")}>Marta G. <span style={S("color:#C99A3C;font-size:11.5px")}>★</span><span style={S("font-size:11.5px;font-weight:700")}> 4,9</span> <span style={S("font-size:10px;color:#2E5A3A;font-weight:700")}>✓ verificada</span></p>
            <p style={S("margin:2px 0 0;font-size:11px;color:#5A5A52")}>Reformer · Prenatal · 6 años · Gràcia</p>
            <span style={S("display:inline-block;margin-top:5px;background:#EAF0E7;color:#2E5A3A;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px")}>Disponible para sustituciones</span>
          </div>
          <span style={S("align-self:center;font-size:15px;color:#98A093")}>›</span>
        </div>
        <div onClick={V.abrirLucia} style={S("display:flex;gap:12px;background:#fff;border:1px solid #E5E3DA;border-radius:18px;padding:11px;cursor:pointer;animation:apUp .4s .07s both")}>
          <img src="/assets/foto-clase.webp" alt="Lucía R." style={S("width:66px;height:66px;border-radius:14px;object-fit:cover")} />
          <div style={S("flex:1;min-width:0")}>
            <p style={S("margin:0;font-size:14px;font-weight:800")}>Lucía R. <span style={S("color:#C99A3C;font-size:11.5px")}>★</span><span style={S("font-size:11.5px;font-weight:700")}> 5,0</span> <span style={S("font-size:10px;color:#2E5A3A;font-weight:700")}>✓ verificada</span></p>
            <p style={S("margin:2px 0 0;font-size:11px;color:#5A5A52")}>Reformer · Barre · 4 años · Sant Antoni</p>
            <span style={S("display:inline-block;margin-top:5px;background:#F6F4EC;color:#5A5A52;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px")}>Freelance · tardes</span>
          </div>
          <span style={S("align-self:center;font-size:15px;color:#98A093")}>›</span>
        </div>
        <div onClick={V.abrirAna} style={S("display:flex;gap:12px;background:#fff;border:1px solid #E5E3DA;border-radius:18px;padding:11px;cursor:pointer;animation:apUp .4s .14s both")}>
          <img src="/assets/foto-hero.jpg" alt="Ana P." style={S("width:66px;height:66px;border-radius:14px;object-fit:cover")} />
          <div style={S("flex:1;min-width:0")}>
            <p style={S("margin:0;font-size:14px;font-weight:800")}>Ana P. <span style={S("color:#C99A3C;font-size:11.5px")}>★</span><span style={S("font-size:11.5px;font-weight:700")}> 4,8</span></p>
            <p style={S("margin:2px 0 0;font-size:11px;color:#5A5A52")}>Mat · Yoga · Prenatal · 8 años · Eixample</p>
            <span style={S("display:inline-block;margin-top:5px;background:#EAF0E7;color:#2E5A3A;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px")}>Disponible para sustituciones</span>
          </div>
          <span style={S("align-self:center;font-size:15px;color:#98A093")}>›</span>
        </div>
        <p style={S("margin:6px 0 0;text-align:center;font-size:11px;color:#98A093")}>Perfiles de Tentare Network · sin comisión</p>
      </div>
    </React.Fragment> : null}
  </div>
  </React.Fragment> : null}

  
  {(V.esReservas) ? <React.Fragment>
  <div style={S("flex:1;overflow-y:auto;padding:56px 18px 92px;animation:apFade .25s both")}>
    <div style={S("display:flex;justify-content:space-between;align-items:center;margin-top:8px")}>
      <h2 style={S("margin:0;font-weight:800;font-size:23px;letter-spacing:-.03em")}>Reservas</h2>
      <button type="button" onClick={V.abrirChat} aria-label="Mensajes" style={S("position:relative;width:38px;height:38px;border:1px solid #E5E3DA;border-radius:999px;background:#fff;cursor:pointer;font-size:14px")}>✉<span style={S("position:absolute;top:7px;right:8px;width:7px;height:7px;border-radius:99px;background:#4F8A5B;border:1.5px solid #fff")}></span></button>
    </div>
    {(V.hayReserva) ? <React.Fragment>
      <div style={S("display:flex;flex-direction:column;gap:9px;margin-top:12px")}>
        {((V.misReservas)||[]).map((r, $index) => (<React.Fragment key={$index}>
          <div style={S("background:#EAF0E7;border-radius:17px;padding:13px 15px;animation:apPop .4s both")}>
            <div style={S("display:flex;justify-content:space-between")}><p style={S("margin:0;font-size:13px;font-weight:800;color:#2E5A3A")}>{r.dia} · {r.hora}</p><span style={S("font-size:10.5px;font-weight:700;color:#2E5A3A")}>confirmada ✓</span></div>
            <p style={S("margin:3px 0 0;font-size:13.5px;font-weight:700")}>{r.nombre} · {r.estudio}</p>
            <p style={S("margin:2px 0 0;font-size:11px;color:#5A5A52")}>con {r.inst} · pagada con bono</p>
            <div style={S("display:flex;gap:7px;margin-top:10px")}>
              <button type="button" onClick={V.tComoLlegar} style={S("border:none;background:#fff;border-radius:999px;padding:7px 12px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer")}>Cómo llegar</button>
              <button type="button" onClick={V.tCalendario} style={S("border:none;background:#fff;border-radius:999px;padding:7px 12px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer")}>+ Calendario</button>
              <button type="button" onClick={r.cambiar} style={S("border:none;background:#fff;border-radius:999px;padding:7px 12px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer")}>Cambiar hora</button>
              <button type="button" onClick={r.cancelar} style={S("border:none;background:rgba(194,80,58,.1);color:#A04A3C;border-radius:999px;padding:7px 12px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer")}>Cancelar</button>
            </div>
          </div>
        </React.Fragment>))}
      </div>
    </React.Fragment> : null}
    {(V.sinReserva) ? <React.Fragment>
      <div style={S("margin-top:12px;border:1.5px dashed #D9D6C9;border-radius:17px;padding:20px 16px;text-align:center")}>
        <p style={S("margin:0;font-size:13.5px;font-weight:800")}>No tienes clases próximas</p>
        <p style={S("margin:4px 0 11px;font-size:12px;color:#5A5A52")}>Hay {V.nHoy} clases hoy cerca de ti que encajan con tu bono.</p>
        <button type="button" onClick={V.irExplorar} style={S("border:none;background:#1A1A1A;color:#F1ECE1;border-radius:999px;padding:10px 19px;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer")}>Verlas</button>
      </div>
    </React.Fragment> : null}
    {(V.hayEspera) ? <React.Fragment>
      <div style={S("margin-top:9px;background:#fff;border:1px solid #E5E3DA;border-radius:17px;padding:13px 15px;animation:apUp .4s both")}>
        <div style={S("display:flex;justify-content:space-between;align-items:center")}>
          <p style={S("margin:0;font-size:12.5px;font-weight:800")}>Lista de espera</p>
          <span style={S("display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:#8A6A25")}><span style={S("width:6px;height:6px;border-radius:99px;background:#C99A3C;animation:apPulse 2s infinite")}></span>eres la 2ª</span>
        </div>
        <p style={S("margin:3px 0 0;font-size:12.5px;color:#5A5A52")}>Reformer · suave · hoy 20:30 · Studio Alma</p>
        <p style={S("margin:5px 0 0;font-size:10.5px;color:#98A093")}>Te avisamos al momento si se libera una plaza.</p>
      </div>
    </React.Fragment> : null}
    {(V.pfHay) ? <React.Fragment>
      <div style={S("margin-top:12px;background:#fff;border:1px solid #E5E3DA;border-radius:17px;padding:13px 15px")}>
        <div style={S("display:flex;justify-content:space-between;align-items:center")}>
          <p style={S("margin:0;font-size:13px;font-weight:800")}>Tu plaza fija</p>
          <span style={V.pfBadgeCss}>{V.pfBadge}</span>
        </div>
        <p style={S("margin:4px 0 0;font-size:12.5px;color:#5A5A52")}>Todos los <b style={S("color:#1A1A1A")}>martes · 19:30</b> · Reformer · sala 1</p>
        <div style={S("display:flex;gap:7px;margin-top:10px")}>
          <button type="button" onClick={V.pfToggle} style={S("border:1px solid #E5E3DA;background:#F6F4EC;border-radius:999px;padding:7px 13px;font-family:inherit;font-size:11px;font-weight:800;cursor:pointer")}>{V.pfAccion}</button>
          <button type="button" onClick={V.pfBaja} style={S("border:none;background:rgba(194,80,58,.1);color:#A04A3C;border-radius:999px;padding:7px 13px;font-family:inherit;font-size:11px;font-weight:800;cursor:pointer")}>Dar de baja</button>
        </div>
      </div>
    </React.Fragment> : null}
    <div style={S("margin-top:12px;background:#fff;border:1px solid #E5E3DA;border-radius:17px;padding:13px 15px")}>
      <div style={S("display:flex;justify-content:space-between;align-items:center")}><p style={S("margin:0;font-size:13px;font-weight:800")}>Bono 5 sesiones</p><span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10.5px;color:#5A5A52")}>caduca 12 oct</span></div>
      <div style={S("height:6px;border-radius:99px;background:#EFEDE4;margin-top:9px;overflow:hidden")}><div style={V.bonoBarra}></div></div>
      <div style={S("display:flex;justify-content:space-between;align-items:center;margin-top:7px")}>
        <p style={S("margin:0;font-size:11.5px;color:#5A5A52")}>Te quedan <b style={S("color:#2E5A3A")}>{V.bono} sesiones</b></p>
        <button type="button" onClick={V.abrirPago} style={S("border:none;background:none;padding:0;font-family:inherit;font-size:11.5px;font-weight:800;color:#3E6B4A;cursor:pointer")}>Comprar otro →</button>
      </div>
    </div>
    <div style={S("margin-top:9px;background:#fff;border:1px solid #E5E3DA;border-radius:17px;padding:13px 15px")}>
      <div style={S("display:flex;justify-content:space-between;align-items:center")}>
        <p style={S("margin:0;font-size:13px;font-weight:800")}>Tu plan · Cuota 8 clases/mes</p>
        <span style={S("font-size:10px;font-weight:800;padding:4px 10px;border-radius:999px;background:#EAF0E7;color:#2E5A3A")}>activa</span>
      </div>
      <p style={S("margin:4px 0 0;font-size:12px;color:#5A5A52")}>89 €/mes (ejemplo) · próximo cobro 1 sep · renovación automática</p>
      <button type="button" onClick={V.tPlan} style={S("margin-top:9px;border:1px solid #E5E3DA;background:#F6F4EC;border-radius:999px;padding:7px 13px;font-family:inherit;font-size:11px;font-weight:800;cursor:pointer")}>Gestionar mi plan</button>
    </div>
    <p style={S("margin:16px 0 7px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Pagos</p>
    <div style={S("display:flex;flex-direction:column;gap:8px")}>
      {((V.recibos)||[]).map((r, $index) => (<React.Fragment key={$index}>
        <div style={S("display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 14px;animation:apUp .35s both")}>
          <div><p style={S("margin:0;font-size:12.5px;font-weight:700")}>{r.c}</p><p style={S("margin:1px 0 0;font-size:10.5px;color:#98A093")}>{r.f} · recibo enviado por email</p></div>
          <span style={S("font-size:12.5px;font-weight:800")}>{r.i}</span>
        </div>
      </React.Fragment>))}
    </div>
    <p style={S("margin:16px 0 7px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Historial</p>
    <div style={S("display:flex;flex-direction:column;gap:8px")}>
      <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 14px")}>
        <div style={S("display:flex;justify-content:space-between;align-items:center")}>
          <div><p style={S("margin:0;font-size:12.5px;font-weight:700")}>Reformer · Studio Alma</p><p style={S("margin:1px 0 0;font-size:10.5px;color:#98A093")}>sáb 23 · Marta G.</p></div>
          {(V.sinValorar) ? <React.Fragment><button type="button" onClick={V.abrirValorar} style={S("border:1px solid #1A1A1A;background:#fff;border-radius:999px;padding:7px 13px;font-family:inherit;font-size:11px;font-weight:800;cursor:pointer")}>Valorar</button></React.Fragment> : null}
          {(V.yaValorada) ? <React.Fragment><span style={S("font-size:12px;font-weight:800;color:#C99A3C;animation:apPop .4s both")}>{V.misEstrellas}</span></React.Fragment> : null}
        </div>
      </div>
      <div style={S("display:flex;justify-content:space-between;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 14px")}><span style={S("font-size:12.5px;font-weight:700")}>Mat · Espai Llum</span><span style={S("font-size:11px;color:#98A093")}>mar 19</span></div>
      <div style={S("display:flex;justify-content:space-between;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 14px")}><span style={S("font-size:12.5px;font-weight:700")}>Reformer · Studio Alma</span><span style={S("font-size:11px;color:#98A093")}>sáb 16</span></div>
    </div>
  </div>
  </React.Fragment> : null}

  
  {(V.esPerfil) ? <React.Fragment>
  <div style={S("flex:1;overflow-y:auto;padding:56px 18px 92px;animation:apFade .25s both")}>
    <div style={S("display:flex;align-items:center;gap:13px;margin-top:10px")}>
      <div style={S("width:56px;height:56px;border-radius:999px;background:#EAF0E7;color:#2E5A3A;font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center")}>{V.iniciales}</div>
      <div><p style={S("margin:0;font-size:17px;font-weight:800")}>{V.nombre}</p><p style={S("margin:1px 0 0;font-size:12px;color:#5A5A52")}>Socia desde marzo de 2024 · {V.asistidas} clases</p></div>
    </div>
    <div style={S("display:flex;gap:9px;margin-top:14px")}>
      <div style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:15px;padding:11px;text-align:center")}><p style={S("margin:0;font-size:19px;font-weight:800")}>{V.nSesiones}</p><p style={S("margin:1px 0 0;font-size:10px;color:#5A5A52")}>clases este mes</p></div>
      <div style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:15px;padding:11px;text-align:center")}><p style={S("margin:0;font-size:19px;font-weight:800")}>{V.bono}</p><p style={S("margin:1px 0 0;font-size:10px;color:#5A5A52")}>sesiones de bono</p></div>
      <div style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:15px;padding:11px;text-align:center")}><p style={S("margin:0;font-size:19px;font-weight:800")}>{V.nFavs}</p><p style={S("margin:1px 0 0;font-size:10px;color:#5A5A52")}>favoritos</p></div>
    </div>
    <p style={S("margin:17px 0 7px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Tus favoritos</p>
    {(V.tieneFavs) ? <React.Fragment>
      <div style={S("display:flex;gap:9px")}>
        {(V.favAlmaOn) ? <React.Fragment>
          <div onClick={V.abrirAlma} style={S("position:relative;flex:1;height:96px;border-radius:14px;overflow:hidden;cursor:pointer;animation:apPop .4s both")}><img src="/assets/foto-reformer.webp" alt="Studio Alma" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} /><span style={S("position:absolute;left:7px;bottom:7px;background:rgba(250,249,245,.92);border-radius:8px;padding:3px 8px;font-size:10px;font-weight:800")}>Studio Alma</span></div>
        </React.Fragment> : null}
        {(V.favLlumOn) ? <React.Fragment>
          <div style={S("position:relative;flex:1;height:96px;border-radius:14px;overflow:hidden;animation:apPop .4s both")}><img src="/assets/foto-estudio.webp" alt="Espai Llum" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} /><span style={S("position:absolute;left:7px;bottom:7px;background:rgba(250,249,245,.92);border-radius:8px;padding:3px 8px;font-size:10px;font-weight:800")}>Espai Llum</span></div>
        </React.Fragment> : null}
        {(V.favMartaOn) ? <React.Fragment>
          <div onClick={V.abrirMarta} style={S("position:relative;flex:1;height:96px;border-radius:14px;overflow:hidden;cursor:pointer;animation:apPop .4s both")}><img src="/assets/foto-pilates.jpg" alt="Marta G." style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} /><span style={S("position:absolute;left:7px;bottom:7px;background:rgba(250,249,245,.92);border-radius:8px;padding:3px 8px;font-size:10px;font-weight:800")}>Marta G.</span></div>
        </React.Fragment> : null}
      </div>
    </React.Fragment> : null}
    {(V.sinFavs) ? <React.Fragment>
      <p style={S("margin:0;font-size:12px;color:#5A5A52")}>Aún no tienes — toca el ♡ de un estudio o instructora y aparecerá aquí.</p>
    </React.Fragment> : null}

    <div style={S("display:flex;justify-content:space-between;align-items:baseline;margin:17px 0 7px")}>
      <p style={S("margin:0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Tu actividad</p>
      <button type="button" onClick={V.abrirActividad} style={S("border:none;background:none;padding:0;font-family:inherit;font-size:12px;font-weight:800;color:#3E6B4A;cursor:pointer")}>Ver todo →</button>
    </div>
    <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:18px;padding:14px 15px")}>
      <div style={S("display:flex;justify-content:space-between;align-items:center")}>
        <p style={S("margin:0;font-size:13px;font-weight:800")}>🔥 Racha actual</p>
        <p style={S("margin:0;font-size:13px;font-weight:800;color:#C99A3C")}>3 semanas <span style={S("font-size:10.5px;font-weight:600;color:#98A093")}>· mejor: 6</span></p>
      </div>
      <div style={S("display:flex;justify-content:space-between;align-items:baseline;margin-top:13px")}>
        <p style={S("margin:0;font-size:12px;font-weight:700;color:#5A5A52")}>Reto de agosto 🏅</p>
        <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10.5px;color:#8A6A25")}>{V.retoTxt} clases</span>
      </div>
      <div style={S("height:6px;border-radius:99px;background:#EFEDE4;margin-top:7px;overflow:hidden")}><div style={V.retoBarra}></div></div>
      <p style={S("margin:7px 0 0;font-size:10.5px;color:#98A093")}>Complétalo y este mes entras en el sorteo de una sesión privada.</p>
    </div>
    <p style={S("margin:14px 0 7px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Logros</p>
    <div style={S("display:grid;grid-template-columns:repeat(4,1fr);gap:8px")}>
      <div onClick={V.abrirG1} style={S("background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:10px 6px;text-align:center;cursor:pointer")}><span style={S("font-size:19px")}>🎉</span><p style={S("margin:4px 0 0;font-size:9px;font-weight:800;line-height:1.25")}>Primera<br />clase</p></div>
      <div onClick={V.abrirG2} style={S("background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:10px 6px;text-align:center;cursor:pointer")}><span style={S("font-size:19px")}>🔥</span><p style={S("margin:4px 0 0;font-size:9px;font-weight:800;line-height:1.25")}>Racha<br />3 semanas</p></div>
      <div onClick={V.abrirG3} style={S("background:#F6F4EC;border:1px dashed #D9D6C9;border-radius:14px;padding:10px 6px;text-align:center;opacity:.75;cursor:pointer")}><span style={S("font-size:19px;filter:grayscale(1)")}>🌅</span><p style={S("margin:4px 0 0;font-size:9px;font-weight:800;line-height:1.25;color:#98A093")}>Madrugadora<br />2/5</p></div>
      <div onClick={V.abrirG4} style={S("background:#F6F4EC;border:1px dashed #D9D6C9;border-radius:14px;padding:10px 6px;text-align:center;opacity:.75;cursor:pointer")}><span style={S("font-size:19px;filter:grayscale(1)")}>💯</span><p style={S("margin:4px 0 0;font-size:9px;font-weight:800;line-height:1.25;color:#98A093")}>50 clases<br />{V.asistidas}/50</p></div>
    </div>
    <div style={S("display:flex;align-items:center;gap:12px;margin-top:17px;background:#EAF0E7;border:1px solid #CFE0CE;border-radius:18px;padding:14px 16px")}>
      <img src="/assets/isotipo-turquesa.svg" alt="" style={S("width:26px;height:26px")} />
      <div style={S("flex:1")}><p style={S("margin:0;font-size:13.5px;font-weight:800;color:#2E5A3A")}>¿Quieres probar otros estudios?</p><p style={S("margin:2px 0 0;font-size:11px;color:#3E6B4A")}>Descárgate Tentare Network — el marketplace de estudios e instructoras.</p></div>
    </div>
    <p style={S("margin:17px 0 7px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Cuenta</p>
    <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:16px;overflow:hidden")}>
      <button type="button" onClick={V.abrirPago} style={S("width:100%;display:flex;justify-content:space-between;padding:12px 15px;border:none;border-bottom:1px solid #EFEDE4;background:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer")}><span>Bonos y pagos</span><span style={S("color:#98A093")}>›</span></button>
      <button type="button" onClick={V.abrirAjustes} style={S("width:100%;display:flex;justify-content:space-between;padding:12px 15px;border:none;border-bottom:1px solid #EFEDE4;background:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer")}><span>Datos personales</span><span style={S("color:#98A093")}>›</span></button>
      <button type="button" onClick={V.abrirChat} style={S("width:100%;display:flex;justify-content:space-between;padding:12px 15px;border:none;border-bottom:1px solid #EFEDE4;background:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer")}><span>Mensajes</span><span style={S("color:#98A093")}>1 ›</span></button>
      <button type="button" onClick={V.abrirAjustes} style={S("width:100%;display:flex;justify-content:space-between;padding:12px 15px;border:none;border-bottom:1px solid #EFEDE4;background:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer")}><span>Notificaciones</span><span style={S("color:#98A093")}>›</span></button>
      <button type="button" onClick={V.tAjustes} style={S("width:100%;display:flex;justify-content:space-between;padding:12px 15px;border:none;border-bottom:1px solid #EFEDE4;background:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer")}><span>Ayuda</span><span style={S("color:#98A093")}>›</span></button>
      <button type="button" onClick={V.replayOnb} style={S("width:100%;display:flex;justify-content:space-between;padding:12px 15px;border:none;background:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;color:#3E6B4A")}><span>Volver a ver el onboarding</span><span>↻</span></button>
    </div>
  </div>
  </React.Fragment> : null}

  
  <div style={S(`position:absolute;inset:0;z-index:30;background:#FAF9F5;display:flex;flex-direction:column;transform:${V.estudioT};transition:${V.pushTrans};pointer-events:${V.estudioPe}`)}>
    <div onPointerDown={V.swPD} onPointerMove={V.swPM} onPointerUp={V.swPU} style={S("position:absolute;left:0;top:0;bottom:0;width:26px;z-index:6;touch-action:none")} aria-hidden="true"></div>
    {(V.cargando) ? <React.Fragment>
      <div style={S("flex:1;padding:0 0 90px")}><div style={S("height:54px")}></div>
        <div style={S("height:280px;background:linear-gradient(90deg,#EFEDE4 25%,#F6F4EC 45%,#EFEDE4 65%);background-size:400px 100%;animation:apSkel 1.1s linear infinite")}></div>
        <div style={S("padding:18px;display:flex;flex-direction:column;gap:10px")}>
          <div style={S("height:22px;width:60%;border-radius:8px;background:linear-gradient(90deg,#EFEDE4 25%,#F6F4EC 45%,#EFEDE4 65%);background-size:400px 100%;animation:apSkel 1.1s linear infinite")}></div>
          <div style={S("height:12px;width:80%;border-radius:6px;background:linear-gradient(90deg,#EFEDE4 25%,#F6F4EC 45%,#EFEDE4 65%);background-size:400px 100%;animation:apSkel 1.1s linear infinite")}></div>
          <div style={S("height:76px;border-radius:14px;background:linear-gradient(90deg,#EFEDE4 25%,#F6F4EC 45%,#EFEDE4 65%);background-size:400px 100%;animation:apSkel 1.1s linear infinite")}></div>
          <div style={S("height:76px;border-radius:14px;background:linear-gradient(90deg,#EFEDE4 25%,#F6F4EC 45%,#EFEDE4 65%);background-size:400px 100%;animation:apSkel 1.1s linear infinite")}></div>
        </div>
      </div>
    </React.Fragment> : null}
    {(V.listoEstudio) ? <React.Fragment>
      <div style={S("flex:1;overflow-y:auto;padding-bottom:20px;animation:apFade .3s both;overscroll-behavior:contain")}>
        <div style={S("position:relative;height:290px;overflow:hidden")}>
          <div role="img" aria-label={V.estNombre} style={S(`position:absolute;inset:0;background-image:url('${V.estFoto}');background-size:cover;background-position:center;animation:apZoomIn .55s cubic-bezier(.2,.7,0,1) both,apKen 18s .6s ease-in-out infinite`)}></div>
          <div style={S("position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,15,15,.36),rgba(15,15,15,0) 36%,rgba(15,15,15,0) 55%,rgba(15,15,15,.64))")} aria-hidden="true"></div>
          <button type="button" onClick={V.cerrarPantalla} aria-label="Volver" style={S("position:absolute;top:56px;left:14px;width:34px;height:34px;border:none;border-radius:999px;background:rgba(250,249,245,.92);font-size:15px;cursor:pointer")}>←</button>
          <button type="button" onClick={V.favEst} aria-label="Guardar" style={S(`position:absolute;top:56px;right:14px;width:34px;height:34px;border:none;border-radius:999px;background:rgba(250,249,245,.92);cursor:pointer;font-size:16px;line-height:1;${V.favEstCss}`)}>{V.favEstIco}</button>
          <div style={S("position:absolute;left:16px;right:16px;bottom:13px;color:#fff")}>
            <p style={S("margin:0;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.85)")}>{V.estMeta}</p>
            <h2 style={S("margin:2px 0 0;font-size:25px;font-weight:800;letter-spacing:-.03em")}>{V.estNombre}</h2>
            <div style={S("display:flex;gap:6px;margin-top:7px")}>
              <span style={S("background:rgba(250,249,245,.2);border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:700")}>{V.estTag1}</span>
              <span style={S("background:rgba(250,249,245,.2);border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:700")}>{V.estTag2}</span>
              <span style={S("background:rgba(250,249,245,.2);border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:700")}>{V.estTag3}</span>
            </div>
          </div>
        </div>
        <div style={S("display:flex;gap:9px;padding:12px 16px 0;overflow-x:auto;scroll-snap-type:x mandatory")}>
          <img onClick={V.vf1} src="/assets/foto-pilates.jpg" alt="Galería 1" style={S("width:190px;height:118px;border-radius:14px;object-fit:cover;flex-shrink:0;scroll-snap-align:start;cursor:zoom-in;animation:apUp .4s .04s both")} />
          <img onClick={V.vf2} src="/assets/foto-clase.webp" alt="Galería 2" style={S("width:190px;height:118px;border-radius:14px;object-fit:cover;flex-shrink:0;scroll-snap-align:start;cursor:zoom-in;animation:apUp .4s .1s both")} />
          <img onClick={V.vf3} src="/assets/foto-estudio.webp" alt="Galería 3" style={S("width:190px;height:118px;border-radius:14px;object-fit:cover;flex-shrink:0;scroll-snap-align:start;cursor:zoom-in;animation:apUp .4s .16s both")} />
          <img onClick={V.vf4} src="/assets/foto-hero.jpg" alt="Galería 4" style={S("width:190px;height:118px;border-radius:14px;object-fit:cover;flex-shrink:0;scroll-snap-align:start;cursor:zoom-in;animation:apUp .4s .22s both")} />
        </div>
        <div style={S("padding:14px 18px 0")}>
          <p style={S("margin:0;font-size:13px;line-height:1.6;color:#5A5A52")}>{V.estDesc}</p>
          <div style={S("display:flex;justify-content:space-between;align-items:baseline;margin:16px 0 9px")}>
            <h3 style={S("margin:0;font-size:15.5px;font-weight:800;letter-spacing:-.02em")}>Horario</h3>
            <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;color:#98A093")}>{V.diaLabel}</span>
          </div>
          <div style={S("display:flex;gap:7px;margin-bottom:9px")}>
            {((V.dias)||[]).map((d, $index) => (<React.Fragment key={$index}>
              <button type="button" onClick={d.sel} style={d.cssMini}>{d.label}</button>
            </React.Fragment>))}
          </div>
          <div style={S("display:flex;flex-direction:column;gap:8px")}>
            {((V.clasesEst)||[]).map((c, $index) => (<React.Fragment key={$index}>
              <div onClick={c.abrir} style={S(`display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px;cursor:pointer;animation:apUp .35s both;animation-delay:${c.delay}`)}>
                <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:13px;min-width:42px")}>{c.hora}</span>
                <div style={S("flex:1;min-width:0")}><p style={S("margin:0;font-size:12.5px;font-weight:800")}>{c.nombre}</p><p style={S("margin:1px 0 0;font-size:10.5px;color:#5A5A52")}>{c.inst} · {c.dur} min</p></div>
                <span style={c.badgeCss}>{c.badge}</span>
              </div>
            </React.Fragment>))}
          </div>
          <h3 style={S("margin:16px 0 9px;font-size:15.5px;font-weight:800;letter-spacing:-.02em")}>Instructoras</h3>
          <div style={S("display:flex;gap:9px;overflow-x:auto")}>
            <button type="button" onClick={V.abrirMarta} style={S("flex-shrink:0;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E5E3DA;border-radius:999px;padding:6px 13px 6px 6px;font-family:inherit;cursor:pointer")}><img src="/assets/foto-pilates.jpg" alt="" style={S("width:30px;height:30px;border-radius:999px;object-fit:cover")} /><span style={S("font-size:12px;font-weight:700")}>Marta G. <span style={S("color:#C99A3C")}>★</span> 4,9 ›</span></button>
            <button type="button" onClick={V.abrirLucia} style={S("flex-shrink:0;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #E5E3DA;border-radius:999px;padding:6px 13px 6px 6px;font-family:inherit;cursor:pointer")}><span style={S("width:30px;height:30px;border-radius:999px;background:#F1ECE1;color:#8A6A25;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center")}>LR</span><span style={S("font-size:12px;font-weight:700")}>Lucía R. <span style={S("color:#C99A3C")}>★</span> 5,0</span></button>
          </div>
          <h3 style={S("margin:16px 0 8px;font-size:15.5px;font-weight:800;letter-spacing:-.02em")}>Opiniones <span style={S("font-size:11px;font-weight:700;color:#5A5A52")}>128 · ★ 4,9</span></h3>
          <div style={S("display:flex;flex-direction:column;gap:8px;margin-bottom:14px")}>
            <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}>
              <p style={S("margin:0;font-size:11.5px;font-weight:800")}><span style={S("color:#C99A3C")}>★★★★★</span> · Clara V. · hace 2 días</p>
              <p style={S("margin:4px 0 0;font-size:12px;line-height:1.55;color:#5A5A52")}>Grupos pequeños de verdad y Marta corrige muchísimo. Reservar por la app tarda dos segundos.</p>
            </div>
            <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}>
              <p style={S("margin:0;font-size:11.5px;font-weight:800")}><span style={S("color:#C99A3C")}>★★★★★</span> · Núria T. · hace 1 semana</p>
              <p style={S("margin:4px 0 0;font-size:12px;line-height:1.55;color:#5A5A52")}>La lista de espera funciona: me avisaron y entré a la clase de las 20:30 el mismo día.</p>
            </div>
          </div>
        </div>
      </div>
      <div style={S("padding:10px 16px 24px;background:linear-gradient(180deg,rgba(250,249,245,0),#FAF9F5 34%)")}>
        <button type="button" onClick={V.abrirProxima} style={S("width:100%;height:52px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 14px 30px -10px rgba(26,26,26,.45)")}>{V.estCta}</button>
      </div>
    </React.Fragment> : null}
  </div>

  
  <div style={S(`position:absolute;inset:0;z-index:32;background:#FAF9F5;display:flex;flex-direction:column;transform:${V.martaT};transition:transform .38s cubic-bezier(.3,.9,.2,1);pointer-events:${V.martaPe}`)}>
    <div style={S("flex:1;overflow-y:auto;padding-bottom:20px")}>
      <div style={S("position:relative;height:270px;overflow:hidden")}>
        <div role="img" aria-label={V.insNombre} style={S(`position:absolute;inset:0;background-image:url('${V.insFoto}');background-size:cover;background-position:center`)}></div>
        <div style={S("position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,15,15,.36),rgba(15,15,15,0) 36%,rgba(15,15,15,0) 55%,rgba(15,15,15,.66))")} aria-hidden="true"></div>
        <button type="button" onClick={V.cerrarMarta} aria-label="Volver" style={S("position:absolute;top:56px;left:14px;width:34px;height:34px;border:none;border-radius:999px;background:rgba(250,249,245,.92);font-size:15px;cursor:pointer")}>←</button>
        <button type="button" onClick={V.favIns} aria-label="Guardar" style={S(`position:absolute;top:56px;right:14px;width:34px;height:34px;border:none;border-radius:999px;background:rgba(250,249,245,.92);cursor:pointer;font-size:16px;line-height:1;${V.favInsCss}`)}>{V.favInsIco}</button>
        <div style={S("position:absolute;left:16px;right:16px;bottom:13px;color:#fff")}>
          <p style={S("margin:0;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.88)")}>Instructora · Tentare Network</p>
          <h2 style={S("margin:2px 0 0;font-size:25px;font-weight:800;letter-spacing:-.03em")}>{V.insNombre} <span style={S("font-size:13px;font-weight:700")}>{V.insRating}</span></h2>
          <div style={S("display:flex;gap:6px;margin-top:7px")}>
            <span style={S("background:#4F8A5B;border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:800")}>✓ Verificada</span>
            <span style={S("background:rgba(250,249,245,.2);border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:4px 10px;font-size:10.5px;font-weight:700")}>{V.insZona}</span>
          </div>
        </div>
      </div>
      <div style={S("padding:14px 18px 0")}>
        <div style={S("display:flex;flex-wrap:wrap;gap:6px")}>
          <span style={S("background:#F1F2EA;border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:700")}>{V.insTag1}</span>
          <span style={S("background:#F1F2EA;border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:700")}>{V.insTag2}</span>
          <span style={S("background:#F1F2EA;border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:700")}>{V.insTag3}</span>
          <span style={S("background:#F1F2EA;border-radius:999px;padding:6px 12px;font-size:11.5px;font-weight:700")}>ES · CAT · EN</span>
        </div>
        <p style={S("margin:12px 0 0;font-size:12.5px;line-height:1.6;color:#5A5A52")}>{V.insBio}</p>
        <div style={S("display:flex;flex-direction:column;margin-top:12px;background:#fff;border:1px solid #E5E3DA;border-radius:16px;overflow:hidden")}>
          <div style={S("display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #EFEDE4")}><span style={S("font-size:12px;color:#5A5A52")}>Experiencia</span><span style={S("font-size:12px;font-weight:800")}>{V.insExp} <span style={S("color:#2E5A3A")}>✓</span></span></div>
          <div style={S("display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #EFEDE4")}><span style={S("font-size:12px;color:#5A5A52")}>Certificaciones</span><span style={S("font-size:12px;font-weight:800")}>{V.insCert}</span></div>
          <div style={S("display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #EFEDE4")}><span style={S("font-size:12px;color:#5A5A52")}>Disponibilidad</span><span style={S("display:flex;align-items:center;gap:6px;font-size:12px;font-weight:800")}><span style={S("width:6px;height:6px;border-radius:99px;background:#4F8A5B;animation:apPulse 2.2s infinite")}></span>{V.insDisp}</span></div>
          <div style={S("display:flex;justify-content:space-between;padding:11px 14px")}><span style={S("font-size:12px;color:#5A5A52")}>Tarifa orientativa</span><span style={S("font-size:12px;font-weight:800")}>{V.insTarifa}</span></div>
        </div>
        <h3 style={S("margin:15px 0 8px;font-size:15px;font-weight:800;letter-spacing:-.02em")}>Opiniones de estudios</h3>
        <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px;margin-bottom:14px")}>
          <p style={S("margin:0;font-size:11.5px;font-weight:800")}><span style={S("color:#C99A3C")}>★★★★★</span> · Studio Alma · hace 3 semanas</p>
          <p style={S("margin:4px 0 0;font-size:12px;line-height:1.55;color:#5A5A52")}>Cubrió una baja el mismo día y las alumnas pidieron repetir con ella. Puntual y muy profesional.</p>
        </div>
        <h3 style={S("margin:15px 0 8px;font-size:15px;font-weight:800;letter-spacing:-.02em")}>Sus clases esta semana</h3>
        <div style={S("display:flex;flex-direction:column;gap:8px;margin-bottom:14px")}>
          {((V.clasesIns)||[]).map((c, $index) => (<React.Fragment key={$index}>
            <div onClick={c.abrir} style={S("display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:10px 13px;cursor:pointer")}>
              <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:12.5px;min-width:74px")}>{c.diaHora}</span>
              <p style={S("margin:0;flex:1;font-size:12px;font-weight:800")}>{c.nombre}</p>
              <span style={c.badgeCss}>{c.badge}</span>
            </div>
          </React.Fragment>))}
        </div>
      </div>
    </div>
    <div style={S("padding:10px 16px 24px;background:linear-gradient(180deg,rgba(250,249,245,0),#FAF9F5 34%);display:flex;gap:9px")}>
      <button type="button" onClick={V.tContactar} style={S("flex:1;height:50px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer")}>Contactar</button>
      <button type="button" onClick={V.tSustitucion} style={S("flex:1;height:50px;border:1.5px solid #1A1A1A;border-radius:999px;background:#fff;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer")}>Proponer sustitución</button>
    </div>
  </div>

  
  <div style={S(`position:absolute;inset:0;z-index:33;background:#14160F;color:#FAF9F5;display:flex;flex-direction:column;transform:${V.panelT};transition:transform .38s cubic-bezier(.3,.9,.2,1);pointer-events:${V.panelPe}`)}>
    <div style={S("display:flex;align-items:center;gap:11px;padding:58px 16px 12px;border-bottom:1px solid rgba(255,255,255,.08)")}>
      <button type="button" onClick={V.cerrarPanel} aria-label="Volver" style={S("width:34px;height:34px;border:none;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font-size:15px;cursor:pointer")}>←</button>
      <div style={S("flex:1")}><p style={S("margin:0;font-size:14px;font-weight:800")}>Studio Alma · Panel</p><p style={S("margin:1px 0 0;font-size:10.5px;color:rgba(255,255,255,.55)")}>modo estudio · demo de sustituciones</p></div>
      <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;color:#A8B080")}>{V.cronoTxt}</span>
    </div>
    <div style={S("flex:1;overflow-y:auto;padding:16px")}>
      {(V.ssPush) ? <React.Fragment>
        <div style={S("display:flex;gap:8px;margin-bottom:12px")}>
          <div style={S("flex:1.2;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:10px 12px")}>
            <p style={S("margin:0;font-size:17px;font-weight:800;color:#fff")}>82%</p><p style={S("margin:1px 0 6px;font-size:9.5px;color:rgba(255,255,255,.55)")}>ocupación hoy</p>
            <div style={S("height:4px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden")}><div style={S("width:82%;height:100%;background:#4F8A5B;border-radius:99px")}></div></div>
          </div>
          <div style={S("flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:10px 12px")}><p style={S("margin:0;font-size:17px;font-weight:800;color:#fff")}>14</p><p style={S("margin:1px 0 0;font-size:9.5px;color:rgba(255,255,255,.55)")}>clases hoy</p></div>
          <div style={S("flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:10px 12px")}><p style={S("margin:0;font-size:17px;font-weight:800;color:#fff")}>3</p><p style={S("margin:1px 0 0;font-size:9.5px;color:rgba(255,255,255,.55)")}>bajas cubiertas<br />este mes</p></div>
        </div>
        <div style={S("background:rgba(194,80,58,.14);border:1px solid rgba(194,80,58,.4);border-radius:18px;padding:15px 16px;animation:apPop .45s both")}>
          <p style={S("margin:0;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#E8907D")}>Baja de última hora</p>
          <h3 style={S("margin:6px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em;color:#fff")}>Marta no puede dar el Reformer de hoy 18:00</h3>
          <p style={S("margin:6px 0 0;font-size:12.5px;color:rgba(255,255,255,.7)")}>Avisó desde su app hace 1 min · 5 alumnas apuntadas a la clase.</p>
        </div>
        <div style={S("background:rgba(168,176,128,.12);border:1px solid rgba(168,176,128,.35);border-radius:18px;padding:13px 16px;margin-top:10px;animation:apUp .4s .15s both")}>
          <p style={S("margin:0;font-size:12.5px;font-weight:700;color:#CFE0CE")}>Tentare ya ha cruzado la clase con la red: <b style={S("color:#fff")}>3 instructoras disponibles</b> cerca con Reformer.</p>
        </div>
        <button type="button" onClick={V.verCandidatas} style={S("width:100%;height:52px;margin-top:14px;border:none;border-radius:999px;background:#FAF9F5;color:#14160F;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer;animation:apUp .4s .25s both")}>Ver candidatas</button>
      </React.Fragment> : null}
      {(V.ssCand) ? <React.Fragment>
        <p style={S("margin:0 0 10px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.5)")}>Ordenadas por encaje · Reformer · hoy 18:00</p>
        <div style={S("display:flex;flex-direction:column;gap:9px")}>
          <div style={S("background:rgba(255,255,255,.06);border:1.5px solid #4F8A5B;border-radius:16px;padding:13px 14px;animation:apUp .35s both")}>
            <div style={S("display:flex;justify-content:space-between;align-items:center")}><p style={S("margin:0;font-size:14px;font-weight:800;color:#fff")}>Lucía R. <span style={S("font-size:11px;color:#C99A3C")}>★ 5,0</span></p><span style={S("background:#4F8A5B;color:#fff;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px")}>mejor encaje</span></div>
            <p style={S("margin:4px 0 0;font-size:11.5px;color:rgba(255,255,255,.65)")}>0,8 km · Reformer, Barre · libre hoy 18:00 · ✓ verificada por Nord Pilates</p>
          </div>
          <div style={S("background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:13px 14px;animation:apUp .35s .08s both")}>
            <p style={S("margin:0;font-size:14px;font-weight:800;color:#fff")}>Ana P. <span style={S("font-size:11px;color:#C99A3C")}>★ 4,8</span></p>
            <p style={S("margin:4px 0 0;font-size:11.5px;color:rgba(255,255,255,.65)")}>2,1 km · Mat, Yoga · libre desde 17:30</p>
          </div>
          <div style={S("background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:13px 14px;animation:apUp .35s .16s both")}>
            <p style={S("margin:0;font-size:14px;font-weight:800;color:#fff")}>Júlia F. <span style={S("font-size:11px;color:#C99A3C")}>★ 4,9</span></p>
            <p style={S("margin:4px 0 0;font-size:11.5px;color:rgba(255,255,255,.65)")}>2,4 km · Reformer, Gyrotonic · confirma en ~15 min</p>
          </div>
        </div>
        <button type="button" onClick={V.proponerLucia} style={S("width:100%;height:52px;margin-top:14px;border:none;border-radius:999px;background:#4F8A5B;color:#fff;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer")}>Proponer sustitución a Lucía</button>
      </React.Fragment> : null}
      {(V.ssWait) ? <React.Fragment>
        <div style={S("display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0 0;text-align:center")}>
          <span style={S("width:52px;height:52px;border-radius:999px;border:3px solid rgba(255,255,255,.15);border-top-color:#4F8A5B;animation:apSpin 1s linear infinite")}></span>
          <h3 style={S("margin:18px 0 0;font-size:18px;font-weight:800;color:#fff")}>Propuesta enviada a Lucía</h3>
          <p style={S("margin:6px 0 0;font-size:12.5px;color:rgba(255,255,255,.6)")}>Le ha llegado un push con la clase, la hora y la tarifa.<br />Suele responder en segundos…</p>
        </div>
      </React.Fragment> : null}
      {(V.ssOk) ? <React.Fragment>
        <div style={S("text-align:center;padding:26px 0 0")}>
          <div style={S("position:relative;width:66px;height:66px;margin:0 auto")}>
            <span style={S("position:absolute;inset:0;border-radius:999px;border:2.5px solid #4F8A5B;animation:apRing .9s ease-out both")}></span>
            <span style={S("position:absolute;inset:0;border-radius:999px;background:#4F8A5B;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;animation:apCheck .55s cubic-bezier(.34,1.5,.5,1) both")}>✓</span>
          </div>
          <h3 style={S("margin:16px 0 0;font-size:21px;font-weight:800;letter-spacing:-.025em;color:#fff;animation:apUp .4s .15s both")}>Sustitución resuelta</h3>
          <p style={S("margin:5px 0 0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:12px;color:#A8B080;animation:apUp .4s .2s both")}>en {V.segsTxt} — sin un solo WhatsApp</p>
          <div style={S("text-align:left;max-width:290px;margin:20px auto 0;display:flex;flex-direction:column;gap:9px;animation:apUp .4s .3s both")}>
            <p style={S("margin:0;font-size:12.5px;color:rgba(255,255,255,.8)")}><span style={S("color:#4F8A5B")}>✓</span>&nbsp; Lucía cubre el Reformer de hoy 18:00</p>
            <p style={S("margin:0;font-size:12.5px;color:rgba(255,255,255,.8)")}><span style={S("color:#4F8A5B")}>✓</span>&nbsp; Calendario del estudio actualizado</p>
            <p style={S("margin:0;font-size:12.5px;color:rgba(255,255,255,.8)")}><span style={S("color:#4F8A5B")}>✓</span>&nbsp; Las 5 alumnas, avisadas del cambio</p>
            <p style={S("margin:0;font-size:12.5px;color:rgba(255,255,255,.8)")}><span style={S("color:#4F8A5B")}>✓</span>&nbsp; Marta, notificada — que se mejore</p>
          </div>
          <button type="button" onClick={V.cerrarPanel} style={S("width:100%;height:50px;margin-top:22px;border:none;border-radius:999px;background:#FAF9F5;color:#14160F;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer;animation:apUp .4s .4s both")}>Volver a mi vista de alumna</button>
        </div>
      </React.Fragment> : null}
    </div>
  </div>

  
  <div style={S(`position:absolute;inset:0;z-index:33;background:#FAF9F5;display:flex;flex-direction:column;transform:${V.chatT};transition:transform .38s cubic-bezier(.3,.9,.2,1);pointer-events:${V.chatPe}`)}>
    <div style={S("display:flex;align-items:center;gap:11px;padding:58px 16px 12px;border-bottom:1px solid #EFEDE4;background:rgba(250,249,245,.94)")}>
      <button type="button" onClick={V.cerrarChat} aria-label="Volver" style={S("width:34px;height:34px;border:none;border-radius:999px;background:#EFEDE4;font-size:15px;cursor:pointer")}>←</button>
      <img src="/assets/foto-reformer.webp" alt="" style={S("width:34px;height:34px;border-radius:999px;object-fit:cover")} />
      <div style={S("flex:1")}><p style={S("margin:0;font-size:14px;font-weight:800")}>Studio Alma</p><p style={S("margin:1px 0 0;font-size:10.5px;color:#4F8A5B;font-weight:700")}>● suele responder en minutos</p></div>
    </div>
    <div style={S("flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:8px")}>
      {((V.chatMsgs)||[]).map((m, $index) => (<React.Fragment key={$index}>
        <div style={m.css}><p style={S("margin:0;font-size:13px;line-height:1.5")}>{m.t}</p></div>
      </React.Fragment>))}
      {(V.chatTyping) ? <React.Fragment>
        <div style={S("align-self:flex-start;background:#fff;border:1px solid #E5E3DA;border-radius:16px 16px 16px 5px;padding:11px 15px;display:flex;gap:5px")}>
          <span style={S("width:6px;height:6px;border-radius:99px;background:#98A093;animation:apPulse .9s infinite")}></span><span style={S("width:6px;height:6px;border-radius:99px;background:#98A093;animation:apPulse .9s .15s infinite")}></span><span style={S("width:6px;height:6px;border-radius:99px;background:#98A093;animation:apPulse .9s .3s infinite")}></span>
        </div>
      </React.Fragment> : null}
    </div>
    <div style={S("display:flex;gap:8px;padding:10px 14px 26px;border-top:1px solid #EFEDE4;background:#FAF9F5")}>
      <input value={V.chatQ} onChange={V.onChatQ} placeholder="Escribe un mensaje…" style={S("flex:1;background:#fff;border:1.5px solid #E5E3DA;border-radius:999px;padding:12px 16px;font-family:inherit;font-size:13.5px;color:#1A1A1A")} />
      <button type="button" onClick={V.enviarChat} aria-label="Enviar" style={S("width:44px;height:44px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-size:15px;cursor:pointer")}>↑</button>
    </div>
  </div>

  
  <div style={S(`position:absolute;inset:0;z-index:33;background:#FAF9F5;display:flex;flex-direction:column;transform:${V.insPanT};transition:transform .38s cubic-bezier(.3,.9,.2,1);pointer-events:${V.insPanPe}`)}>
    <div style={S("display:flex;align-items:center;gap:11px;padding:58px 16px 12px;border-bottom:1px solid #EFEDE4")}>
      <button type="button" onClick={V.cerrarInsPan} aria-label="Volver" style={S("width:34px;height:34px;border:none;border-radius:999px;background:#EFEDE4;font-size:15px;cursor:pointer")}>←</button>
      <img src="/assets/foto-pilates.jpg" alt="" style={S("width:34px;height:34px;border-radius:999px;object-fit:cover")} />
      <div style={S("flex:1")}><p style={S("margin:0;font-size:14px;font-weight:800")}>Marta G. · Instructora</p><p style={S("margin:1px 0 0;font-size:10.5px;color:#5A5A52")}>tu agenda · Tentare Network</p></div>
      <span style={S("background:#EAF0E7;color:#2E5A3A;font-size:9.5px;font-weight:800;padding:4px 9px;border-radius:999px")}>Sustituciones ON</span>
    </div>
    <div style={S("flex:1;overflow-y:auto;padding:14px 16px 30px")}>
      {(V.subPend) ? <React.Fragment>
        <div style={S("background:#fff;border:1.5px solid #4F8A5B;border-radius:18px;padding:14px 15px;animation:apPop .45s both")}>
          <p style={S("margin:0;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#3E6B4A")}>Solicitud de sustitución</p>
          <h3 style={S("margin:6px 0 0;font-size:16.5px;font-weight:800;letter-spacing:-.02em")}>Nord Pilates te propone: Reformer · mañana 11:00</h3>
          <p style={S("margin:5px 0 0;font-size:12px;color:#5A5A52")}>50 min · 5 alumnas · 30 €/h (tu tarifa) · a 2,8 km</p>
          <div style={S("display:flex;gap:8px;margin-top:12px")}>
            <button type="button" onClick={V.aceptarSub} style={S("flex:1;height:42px;border:none;border-radius:999px;background:#4F8A5B;color:#fff;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer")}>Aceptar</button>
            <button type="button" onClick={V.rechazarSub} style={S("flex:1;height:42px;border:1.5px solid #E5E3DA;border-radius:999px;background:#fff;font-family:inherit;font-size:12.5px;font-weight:800;cursor:pointer")}>No puedo</button>
          </div>
        </div>
      </React.Fragment> : null}
      {(V.subOk) ? <React.Fragment>
        <div style={S("display:flex;align-items:center;gap:10px;background:#EAF0E7;border-radius:16px;padding:12px 15px;animation:apPop .4s both")}>
          <span style={S("width:26px;height:26px;flex-shrink:0;border-radius:999px;background:#4F8A5B;color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center")}>✓</span>
          <p style={S("margin:0;font-size:12.5px;font-weight:700;color:#2E5A3A")}>Aceptada — Nord Pilates y sus alumnas ya están avisados.</p>
        </div>
      </React.Fragment> : null}
      <p style={S("margin:16px 0 8px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Tu agenda</p>
      <div style={S("display:flex;flex-direction:column;gap:8px")}>
        <div style={S("display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}>
          <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:12.5px;min-width:74px")}>hoy 18:00</span>
          <p style={S("margin:0;flex:1;font-size:12.5px;font-weight:800")}>Reformer · nivel medio</p>
          <span style={S("font-size:10.5px;font-weight:700;color:#5A5A52")}>Studio Alma · 5/6</span>
        </div>
        <div style={S("display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}>
          <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:12.5px;min-width:74px")}>hoy 19:30</span>
          <p style={S("margin:0;flex:1;font-size:12.5px;font-weight:800")}>Reformer · intenso</p>
          <span style={S("font-size:10.5px;font-weight:700;color:#5A5A52")}>Studio Alma · {V.ocupacion1930}</span>
        </div>
        {(V.subOk) ? <React.Fragment>
          <div style={S("display:flex;align-items:center;gap:11px;background:#EAF0E7;border:1px solid #CFE0CE;border-radius:14px;padding:11px 13px;animation:apUp .4s both")}>
            <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:12.5px;min-width:74px")}>mañ. 11:00</span>
            <p style={S("margin:0;flex:1;font-size:12.5px;font-weight:800")}>Reformer · sustitución</p>
            <span style={S("font-size:10.5px;font-weight:800;color:#2E5A3A")}>Nord Pilates · nueva</span>
          </div>
        </React.Fragment> : null}
      </div>
      <p style={S("margin:16px 0 8px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Tu perfil público</p>
      <div style={S("display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}>
        <p style={S("margin:0;font-size:12.5px;font-weight:700")}>★ 4,9 · 12 valoraciones · 143 visitas este mes</p>
        <button type="button" onClick={V.abrirMarta} style={S("border:none;background:none;padding:0;font-family:inherit;font-size:11.5px;font-weight:800;color:#3E6B4A;cursor:pointer")}>Ver →</button>
      </div>
    </div>
  </div>

  
  <div style={S(`position:absolute;inset:0;z-index:33;background:#FAF9F5;display:flex;flex-direction:column;transform:${V.ajustesT};transition:transform .38s cubic-bezier(.3,.9,.2,1);pointer-events:${V.ajustesPe}`)}>
    <div style={S("display:flex;align-items:center;gap:11px;padding:58px 16px 12px;border-bottom:1px solid #EFEDE4")}>
      <button type="button" onClick={V.cerrarAjustes} aria-label="Volver" style={S("width:34px;height:34px;border:none;border-radius:999px;background:#EFEDE4;font-size:15px;cursor:pointer")}>←</button>
      <p style={S("margin:0;font-size:15px;font-weight:800")}>Datos y ajustes</p>
    </div>
    <div style={S("flex:1;overflow-y:auto;padding:16px 18px 30px")}>
      <div style={S("display:flex;align-items:center;gap:14px;margin-bottom:18px")}>
        <div style={S("position:relative;width:64px;height:64px;flex-shrink:0;border-radius:999px;background:#EAF0E7;color:#2E5A3A;font-weight:800;font-size:21px;display:flex;align-items:center;justify-content:center")}>{V.iniciales}<span style={S("position:absolute;right:-2px;bottom:-2px;width:24px;height:24px;border-radius:999px;background:#1A1A1A;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;border:2px solid #FAF9F5")}>✎</span></div>
        <div>
          <p style={S("margin:0;font-size:15px;font-weight:800")}>{V.ajNombre}</p>
          <button type="button" onClick={V.cambiarFoto} style={S("margin-top:3px;border:none;background:none;padding:0;font-family:inherit;font-size:12px;font-weight:800;color:#3E6B4A;cursor:pointer")}>Cambiar foto</button>
        </div>
      </div>
      <p style={S("margin:0 0 6px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Tu nombre</p>
      <input value={V.ajNombre} onChange={V.onAjNombre} style={S("width:100%;box-sizing:border-box;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:12px 15px;font-family:inherit;font-size:14.5px;font-weight:600;color:#1A1A1A")} />
      <p style={S("margin:4px 0 0;font-size:10.5px;color:#98A093")}>Se actualiza en toda la app al escribir.</p>
      <p style={S("margin:16px 0 6px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Usuario</p>
      <div style={S("display:flex;align-items:center;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:0 15px")}>
        <span style={S("font-size:14.5px;font-weight:700;color:#98A093")}>@</span>
        <input value={V.ajUsuario} onChange={V.onAjUsuario} style={S("flex:1;min-width:0;border:none;background:none;padding:12px 6px;font-family:inherit;font-size:14.5px;font-weight:600;color:#1A1A1A;outline:none")} />
      </div>
      <p style={S("margin:4px 0 0;font-size:10.5px;color:#98A093")}>Tu enlace: tentare.app/u/{V.ajUsuario}</p>
      <p style={S("margin:16px 0 6px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Cuenta y seguridad</p>
      <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:16px;overflow:hidden")}>
        <button type="button" onClick={V.abrirEmail} style={S("width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 15px;border:none;border-bottom:1px solid #EFEDE4;background:none;font-family:inherit;cursor:pointer")}><span style={S("font-size:13px;font-weight:700")}>Email</span><span style={S("display:flex;align-items:center;gap:7px;min-width:0")}><span style={S("font-size:12px;color:#5A5A52;white-space:nowrap;overflow:hidden;text-overflow:ellipsis")}>{V.ajEmail}</span><span style={S("color:#98A093")}>›</span></span></button>
        <button type="button" onClick={V.abrirPass} style={S("width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border:none;background:none;font-family:inherit;cursor:pointer")}><span style={S("font-size:13px;font-weight:700")}>Contraseña</span><span style={S("display:flex;align-items:center;gap:7px")}><span style={S("font-size:12px;color:#5A5A52;letter-spacing:.2em")}>••••••••</span><span style={S("color:#98A093")}>›</span></span></button>
      </div>
      <p style={S("margin:18px 0 6px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Notificaciones</p>
      <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:16px;overflow:hidden")}>
        <div style={S("display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-bottom:1px solid #EFEDE4")}><span style={S("font-size:13px;font-weight:700")}>Recordatorios de clase</span><button type="button" onClick={V.tglRec} aria-label="Recordatorios" style={V.tglRecCss}><span style={V.tglRecKnob}></span></button></div>
        <div style={S("display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-bottom:1px solid #EFEDE4")}><span style={S("font-size:13px;font-weight:700")}>Plazas liberadas (lista de espera)</span><button type="button" onClick={V.tglPlz} aria-label="Plazas" style={V.tglPlzCss}><span style={V.tglPlzKnob}></span></button></div>
        <div style={S("display:flex;justify-content:space-between;align-items:center;padding:12px 15px")}><span style={S("font-size:13px;font-weight:700")}>Novedades de tus estudios</span><button type="button" onClick={V.tglNews} aria-label="Novedades" style={V.tglNewsCss}><span style={V.tglNewsKnob}></span></button></div>
      </div>
      <p style={S("margin:18px 0 6px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Métodos de pago</p>
      <div style={S("background:#fff;border:1px solid #E5E3DA;border-radius:16px;overflow:hidden")}>
        <div style={S("display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-bottom:1px solid #EFEDE4")}><span style={S("font-size:13px;font-weight:700")}>💳 Visa ···· 4242</span><span style={S("font-size:10.5px;font-weight:800;color:#2E5A3A")}>principal</span></div>
        <div style={S("display:flex;justify-content:space-between;align-items:center;padding:12px 15px;border-bottom:1px solid #EFEDE4")}><span style={S("font-size:13px;font-weight:700")}> Apple Pay</span><span style={S("font-size:10.5px;color:#98A093")}>activo</span></div>
        <button type="button" onClick={V.tAjustes} style={S("width:100%;display:flex;justify-content:space-between;padding:12px 15px;border:none;background:none;font-family:inherit;font-size:13px;font-weight:800;color:#3E6B4A;cursor:pointer")}><span>+ Añadir tarjeta</span></button>
      </div>
    </div>
  </div>

  
  <div style={S(`position:absolute;inset:0;z-index:33;background:#FAF9F5;display:flex;flex-direction:column;transform:${V.actividadT};transition:transform .38s cubic-bezier(.3,.9,.2,1);pointer-events:${V.actividadPe}`)}>
    <div style={S("display:flex;align-items:center;gap:11px;padding:58px 16px 12px;border-bottom:1px solid #EFEDE4;background:rgba(250,249,245,.94)")}>
      <button type="button" onClick={V.cerrarActividad} aria-label="Volver" style={S("width:34px;height:34px;border:none;border-radius:999px;background:#EFEDE4;font-size:15px;cursor:pointer")}>←</button>
      <p style={S("margin:0;flex:1;font-size:15px;font-weight:800")}>Tu actividad</p>
      <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;color:#98A093")}>agosto 2026</span>
    </div>
    <div style={S("flex:1;overflow-y:auto;padding:14px 18px 30px")}>
      <div style={S("position:relative;border-radius:20px;overflow:hidden;animation:apPop .45s both")}>
        <img src="/assets/foto-clase.webp" alt="" style={S("position:absolute;inset:0;width:100%;height:100%;object-fit:cover")} />
        <div style={S("position:absolute;inset:0;background:linear-gradient(100deg,rgba(18,41,26,.95),rgba(18,41,26,.7))")} aria-hidden="true"></div>
        <div style={S("position:relative;display:flex;align-items:center;gap:16px;padding:18px 18px;color:#EAF0E7")}>
          <span style={S("font-size:40px;animation:apPulse 2.6s infinite")}>🔥</span>
          <div>
            <p style={S("margin:0;font-size:24px;font-weight:800;letter-spacing:-.03em;color:#FAF9F5")}>3 semanas de racha</p>
            <p style={S("margin:2px 0 0;font-size:11.5px;color:#A8D0A9")}>Tu mejor racha: 6 · no la dejes escapar</p>
          </div>
        </div>
      </div>
      <div style={S("display:flex;align-items:center;gap:18px;margin-top:14px;background:#fff;border:1px solid #E5E3DA;border-radius:20px;padding:16px;animation:apUp .45s .08s both")}>
        <div style={S("position:relative;width:132px;height:132px;flex-shrink:0")}>
          <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#EFEDE4" strokeWidth="11"></circle>
            <circle cx="60" cy="60" r="52" fill="none" stroke="#4F8A5B" strokeWidth="11" strokeLinecap="round" style={S(`stroke-dasharray:327;stroke-dashoffset:${V.anilloOff};transition:stroke-dashoffset 1s cubic-bezier(.2,.7,0,1);transform:rotate(-90deg);transform-origin:center`)}></circle>
          </svg>
          <div style={S("position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center")}>
            <p style={S("margin:0;font-size:29px;font-weight:800;letter-spacing:-.03em;line-height:1")}>{V.anilloNum}<span style={S("font-size:14px;color:#98A093")}>/3</span></p>
            <p style={S("margin:2px 0 0;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#98A093")}>esta semana</p>
          </div>
        </div>
        <div>
          <p style={S("margin:0;font-size:14px;font-weight:800;letter-spacing:-.01em")}>Meta semanal</p>
          <p style={S("margin:5px 0 0;font-size:12px;line-height:1.5;color:#5A5A52")}>{V.anilloSub}</p>
        </div>
      </div>
      <div style={S("display:flex;justify-content:space-between;gap:6px;margin-top:14px;animation:apUp .45s .14s both")}>
        {((V.diasAct)||[]).map((d, $index) => (<React.Fragment key={$index}>
          <button type="button" onClick={d.tap} style={d.css}>{d.l}</button>
        </React.Fragment>))}
      </div>
      <button type="button" onClick={V.abrirReto} style={S("display:flex;align-items:center;gap:13px;width:100%;box-sizing:border-box;margin-top:14px;background:#fff;border:1px solid #E5E3DA;border-radius:18px;padding:14px 15px;font-family:inherit;cursor:pointer;text-align:left;animation:apUp .45s .2s both")}>
        <span style={S("font-size:26px")}>🏅</span>
        <span style={S("flex:1;min-width:0")}>
          <span style={S("display:flex;justify-content:space-between;align-items:baseline")}><span style={S("font-size:13.5px;font-weight:800")}>Reto de agosto</span><span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10.5px;color:#8A6A25")}>{V.retoTxt}</span></span>
          <span style={S("display:block;height:6px;border-radius:99px;background:#EFEDE4;margin-top:8px;overflow:hidden")}><span style={S(`display:block;${V.retoBarra}`)}></span></span>
          <span style={S("display:block;font-size:10.5px;color:#98A093;margin-top:6px")}>Premio: sorteo de una sesión privada · toca para ver las reglas</span>
        </span>
        <span style={S("color:#98A093")}>›</span>
      </button>
      <p style={S("margin:16px 0 8px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Logros</p>
      <div style={S("display:grid;grid-template-columns:repeat(4,1fr);gap:8px;animation:apUp .45s .26s both")}>
        {((V.logrosAct)||[]).map((l, $index) => (<React.Fragment key={$index}>
          <button type="button" onClick={l.abrir} style={l.cardCss}><span style={l.eCss}>{l.e}</span><p style={l.nCss}>{l.n}</p><p style={S("margin:3px 0 0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:8.5px;color:#98A093")}>{l.curTxt}</p></button>
        </React.Fragment>))}
      </div>
      <div style={S("display:flex;gap:9px;margin-top:14px;animation:apUp .45s .32s both")}>
        <div style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:15px;padding:11px;text-align:center")}><p style={S("margin:0;font-size:18px;font-weight:800")}>{V.asistidas}</p><p style={S("margin:1px 0 0;font-size:9.5px;color:#5A5A52")}>clases totales</p></div>
        <div style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:15px;padding:11px;text-align:center")}><p style={S("margin:0;font-size:18px;font-weight:800")}>{V.nSesiones}</p><p style={S("margin:1px 0 0;font-size:9.5px;color:#5A5A52")}>este mes</p></div>
        <div style={S("flex:1;background:#fff;border:1px solid #E5E3DA;border-radius:15px;padding:11px;text-align:center")}><p style={S("margin:0;font-size:18px;font-weight:800")}>92%</p><p style={S("margin:1px 0 0;font-size:9.5px;color:#5A5A52")}>asistencia</p></div>
      </div>
    </div>
  </div>

  
  <div style={S(`position:absolute;inset:0;z-index:34;background:#FAF9F5;display:flex;flex-direction:column;opacity:${V.buscarOp};transform:${V.buscarT};transition:opacity .26s,transform .26s cubic-bezier(.2,.7,0,1);pointer-events:${V.buscarPe}`)}>
    <div style={S("padding:56px 16px 0")}>
      <div style={S("display:flex;gap:9px;align-items:center")}>
        <div style={S("flex:1;display:flex;align-items:center;gap:9px;background:#fff;border:1.5px solid #1A1A1A;border-radius:999px;padding:11px 15px")}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><line x1="16" y1="16" x2="21" y2="21"></line></svg>
          <input value={V.q} onChange={V.onQ} placeholder="Reformer, Marta, Espai Llum…" style={S("flex:1;border:none;background:none;font-family:inherit;font-size:14px;font-weight:600;color:#1A1A1A")} />
        </div>
        <button type="button" onClick={V.cerrarBuscar} style={S("border:none;background:none;font-family:inherit;font-size:13px;font-weight:800;color:#5A5A52;cursor:pointer;padding:8px 2px")}>Cerrar</button>
      </div>
    </div>
    <div style={S("flex:1;overflow-y:auto;padding:14px 16px 30px")}>
      {(V.sinQ) ? <React.Fragment>
        <p style={S("margin:0 0 8px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Búsquedas recientes</p>
        <div style={S("display:flex;flex-wrap:wrap;gap:7px")}>
          <button type="button" onClick={V.qReformer} style={S("border:1px solid #D9D6C9;background:#fff;border-radius:999px;padding:8px 14px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer")}>reformer hoy</button>
          <button type="button" onClick={V.qMarta} style={S("border:1px solid #D9D6C9;background:#fff;border-radius:999px;padding:8px 14px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer")}>marta</button>
          <button type="button" onClick={V.qPrenatal} style={S("border:1px solid #D9D6C9;background:#fff;border-radius:999px;padding:8px 14px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer")}>prenatal</button>
        </div>
        <p style={S("margin:16px 0 8px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Popular en tu estudio</p>
        <div style={S("display:flex;flex-direction:column;gap:8px")}>
          <button type="button" onClick={V.abrirAlma} style={S("display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:10px 13px;font-family:inherit;cursor:pointer;text-align:left")}><img src="/assets/foto-reformer.webp" alt="" style={S("width:42px;height:42px;border-radius:10px;object-fit:cover")} /><span style={S("flex:1")}><span style={S("display:block;font-size:12.5px;font-weight:800")}>Studio Alma</span><span style={S("display:block;font-size:10.5px;color:#5A5A52")}>Estudio · Gràcia · ★ 4,9</span></span><span style={S("color:#98A093")}>›</span></button>
          <button type="button" onClick={V.abrirMarta} style={S("display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:10px 13px;font-family:inherit;cursor:pointer;text-align:left")}><img src="/assets/foto-pilates.jpg" alt="" style={S("width:42px;height:42px;border-radius:10px;object-fit:cover")} /><span style={S("flex:1")}><span style={S("display:block;font-size:12.5px;font-weight:800")}>Marta G.</span><span style={S("display:block;font-size:10.5px;color:#5A5A52")}>Instructora · Reformer · ★ 4,9</span></span><span style={S("color:#98A093")}>›</span></button>
        </div>
      </React.Fragment> : null}
      {(V.conQ) ? <React.Fragment>
        <p style={S("margin:0 0 8px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>{V.nResultados} resultados</p>
        <div style={S("display:flex;flex-direction:column;gap:8px")}>
          {((V.resultados)||[]).map((r, $index) => (<React.Fragment key={$index}>
            <button type="button" onClick={r.abrir} style={S("display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:10px 13px;font-family:inherit;cursor:pointer;text-align:left;animation:apUp .3s both")}>
              <span style={S("width:38px;height:38px;border-radius:10px;background:#F1F2EA;display:flex;align-items:center;justify-content:center;font-size:15px")}>{r.icono}</span>
              <span style={S("flex:1")}><span style={S("display:block;font-size:12.5px;font-weight:800")}>{r.nombre}</span><span style={S("display:block;font-size:10.5px;color:#5A5A52")}>{r.meta}</span></span>
              <span style={S("color:#98A093")}>›</span>
            </button>
          </React.Fragment>))}
          {(V.sinResultados) ? <React.Fragment>
            <div style={S("border:1.5px dashed #D9D6C9;border-radius:16px;padding:18px;text-align:center")}>
              <p style={S("margin:0;font-size:13px;font-weight:800")}>Nada con «{V.q}» cerca de ti</p>
              <p style={S("margin:4px 0 10px;font-size:11.5px;color:#5A5A52")}>Hay 12 opciones a menos de 3 km si amplías la zona.</p>
              <button type="button" onClick={V.qReformer} style={S("border:none;background:#1A1A1A;color:#F1ECE1;border-radius:999px;padding:9px 16px;font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer")}>Ampliar búsqueda</button>
            </div>
          </React.Fragment> : null}
        </div>
      </React.Fragment> : null}
    </div>
  </div>

  
  {(V.visorOn) ? <React.Fragment>
    <div onClick={V.cerrarVisor} style={S("position:absolute;inset:0;z-index:70;background:rgba(10,10,8,.93);display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:apFade .22s both")}>
      <div aria-hidden="true" style={S(`width:88%;aspect-ratio:4/3;border-radius:16px;background-image:url('${V.visorSrc}');background-size:cover;background-position:center;box-shadow:0 30px 80px rgba(0,0,0,.5);animation:apPop .35s cubic-bezier(.34,1.3,.5,1) both`)}></div>
      <span style={S("position:absolute;top:58px;right:18px;color:rgba(255,255,255,.85);font-size:12.5px;font-weight:800")}>✕ cerrar</span>
    </div>
  </React.Fragment> : null}

  
  <div style={S("position:absolute;left:14px;right:14px;bottom:16px;z-index:40;display:flex;justify-content:space-between;align-items:center;gap:2px;padding:6px;background:rgba(250,249,245,.85);backdrop-filter:blur(18px) saturate(1.5);border:1px solid rgba(255,255,255,.75);border-radius:999px;box-shadow:0 16px 44px rgba(8,8,8,.25)")}>
    <button type="button" onClick={V.tabHoy} style={V.tHoy}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path></svg><span style={V.tHoyLbl}>Hoy</span></button>
    <button type="button" onClick={V.tabExplorar} style={V.tExplorar}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg><span style={V.tExplorarLbl}>Horario</span></button>
    <button type="button" onClick={V.tabReservas} style={V.tReservas}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"></rect><line x1="3" y1="10" x2="21" y2="10"></line><line x1="8" y1="3" x2="8" y2="7"></line><line x1="16" y1="3" x2="16" y2="7"></line></svg><span style={V.tReservasLbl}>Reservas</span>
      {(V.badgeReservas) ? <React.Fragment><span style={S("position:absolute;top:2px;right:14px;min-width:15px;height:15px;border-radius:99px;background:#4F8A5B;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;animation:apDot .4s both")}>{V.nReservas}</span></React.Fragment> : null}
    </button>
    <button type="button" onClick={V.tabPerfil} style={V.tPerfil}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg><span style={V.tPerfilLbl}>Perfil</span></button>
  </div>

  
  <div onClick={V.cerrarSheet} style={S(`position:absolute;inset:0;z-index:50;background:rgba(15,15,15,.42);opacity:${V.velo};pointer-events:${V.veloPe};transition:opacity .3s`)} aria-hidden="true"></div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetClaseT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    {(V.modoEspera) ? <React.Fragment>
      <div style={S("padding:14px 18px 30px;text-align:center")}>
        <span style={S("display:inline-block;background:#F4E9E5;color:#A04A3C;border-radius:999px;padding:5px 13px;font-size:11px;font-weight:800")}>Clase llena</span>
        <h3 style={S("margin:12px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em")}>{V.claseNombre}</h3>
        <p style={S("margin:4px 0 0;font-size:13px;color:#5A5A52")}>{V.claseDia} · {V.claseHora} · {V.claseEstudio} · con {V.claseInst}</p>
        <div style={S("background:#F6F4EC;border-radius:14px;padding:12px 14px;margin-top:14px;text-align:left")}>
          <p style={S("margin:0;font-size:12px;line-height:1.55;color:#5A5A52")}>Apúntate a la lista de espera y te avisamos <b style={S("color:#1A1A1A")}>al momento</b> si se libera una plaza. Ahora mismo hay 1 persona delante.</p>
        </div>
        <button type="button" onClick={V.unirmeEspera} style={S("width:100%;height:50px;margin-top:14px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer")}>Unirme a la lista de espera</button>
        <p style={S("margin:10px 0 0;font-size:10.5px;color:#98A093")}>Sin coste — solo reservas si se libera y tú confirmas.</p>
      </div>
    </React.Fragment> : null}
    {(V.paso1) ? <React.Fragment>
      <div style={S("padding:14px 18px 30px")}>
        <div style={S("display:flex;justify-content:space-between;align-items:flex-start")}>
          <div>
            <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>{V.claseNombre}</h3>
            <p style={S("margin:3px 0 0;font-size:12.5px;color:#5A5A52")}>{V.claseDia} · {V.claseHora} · {V.claseDur} min · {V.claseEstudio}</p>
          </div>
          <span style={V.clasePlazasCss}>{V.clasePlazasTxt}</span>
        </div>
        <p style={S("margin:13px 0 6px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Elige tu reformer · sala 2</p>
        <div style={S("display:grid;grid-template-columns:repeat(3,1fr);gap:7px")}>
          {((V.camas)||[]).map((cm, $index) => (<React.Fragment key={$index}>
            <button type="button" onClick={cm.sel} style={cm.css}>{cm.n}<span style={S("display:block;font-size:8.5px;font-weight:600;opacity:.7")}>{cm.sub}</span></button>
          </React.Fragment>))}
        </div>
        <div style={S("display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:10px 13px;margin-top:11px")}>
          <img src="/assets/foto-pilates.jpg" alt="" style={S("width:36px;height:36px;border-radius:999px;object-fit:cover")} />
          <div style={S("flex:1")}><p style={S("margin:0;font-size:12.5px;font-weight:800")}>{V.claseInst}</p><p style={S("margin:1px 0 0;font-size:10.5px;color:#5A5A52")}>★ 4,9 · Reformer · Prenatal</p></div>
          <button type="button" onClick={V.abrirMarta} style={S("border:none;background:none;font-family:inherit;font-size:11.5px;font-weight:800;color:#3E6B4A;cursor:pointer")}>Ver perfil</button>
        </div>
        <div style={S("display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:9px 13px;margin-top:9px")}>
          <div style={S("display:flex;flex-shrink:0")}>
            <img src="/assets/foto-pilates.jpg" alt="" style={S("width:26px;height:26px;border-radius:999px;object-fit:cover;border:2px solid #fff")} />
            <img src="/assets/foto-clase.webp" alt="" style={S("width:26px;height:26px;border-radius:999px;object-fit:cover;border:2px solid #fff;margin-left:-9px")} />
            <img src="/assets/foto-hero.jpg" alt="" style={S("width:26px;height:26px;border-radius:999px;object-fit:cover;border:2px solid #fff;margin-left:-9px")} />
          </div>
          <p style={S("margin:0;flex:1;font-size:11.5px;color:#5A5A52")}><b style={S("color:#1A1A1A")}>3 alumnas</b> ya apuntadas a esta clase</p>
          <button type="button" onClick={V.tComoLlegar} style={S("border:1px solid #E5E3DA;background:#F6F4EC;border-radius:999px;padding:6px 11px;font-family:inherit;font-size:10.5px;font-weight:800;cursor:pointer;white-space:nowrap")}>📍 a 1,2 km</button>
        </div>
        {(V.conBono) ? <React.Fragment>
          <div style={S("display:flex;align-items:center;gap:9px;background:#EAF0E7;border-radius:14px;padding:11px 14px;margin-top:9px")}>
            <span style={S("width:22px;height:22px;flex-shrink:0;border-radius:999px;background:#4F8A5B;color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center")}>✓</span>
            <p style={S("margin:0;flex:1;font-size:12px;font-weight:700;color:#2E5A3A")}>Se usará 1 sesión de tu bono ({V.bono} disponibles). No pagas nada hoy.</p>
          </div>
        </React.Fragment> : null}
        {(V.sinBono) ? <React.Fragment>
          <div style={S("display:flex;align-items:center;gap:9px;background:#fff;border:1.5px solid #1A1A1A;border-radius:14px;padding:11px 14px;margin-top:9px")}>
            <span style={S("font-size:16px")}></span>
            <p style={S("margin:0;flex:1;font-size:12px;font-weight:700")}>Sin sesiones en tu bono — pagarás <b>{V.clasePrecio} €</b> con Apple Pay</p>
            <button type="button" onClick={V.abrirPago} style={S("border:none;background:none;padding:0;font-family:inherit;font-size:11.5px;font-weight:800;color:#3E6B4A;cursor:pointer;white-space:nowrap")}>o compra un bono</button>
          </div>
        </React.Fragment> : null}
        <div style={S("display:flex;gap:14px;justify-content:center;margin-top:10px;padding:9px 0;border-top:1px dashed #E5E3DA;border-bottom:1px dashed #E5E3DA")}>
          <span style={S("font-size:10.5px;font-weight:700;color:#5A5A52")}>🚪 Sala 2</span>
          <span style={S("font-size:10.5px;font-weight:700;color:#5A5A52")}>🧦 Calcetines antideslizantes</span>
          <span style={S("font-size:10.5px;font-weight:700;color:#5A5A52")}>⏰ Llega 10 min antes</span>
        </div>
        <p style={S("margin:9px 0 0;font-size:10.5px;color:#98A093;text-align:center")}>Cancelación gratuita hasta 12 h antes — recuperas la sesión.</p>
        <button type="button" onClick={V.confirmar} style={V.btnConfirmarCss}>
          {(V.btnNormal) ? <React.Fragment><span>{V.btnConfTxt}</span></React.Fragment> : null}
          {(V.btnProc) ? <React.Fragment><span style={S("display:flex;gap:5px")}><span style={S("width:6px;height:6px;border-radius:99px;background:#F1ECE1;animation:apPulse .9s infinite")}></span><span style={S("width:6px;height:6px;border-radius:99px;background:#F1ECE1;animation:apPulse .9s .15s infinite")}></span><span style={S("width:6px;height:6px;border-radius:99px;background:#F1ECE1;animation:apPulse .9s .3s infinite")}></span></span></React.Fragment> : null}
          {(V.btnOk) ? <React.Fragment><span style={S("font-size:19px;animation:apCheck .3s both")}>✓</span></React.Fragment> : null}
        </button>
      </div>
    </React.Fragment> : null}
    {(V.paso2) ? <React.Fragment>
      <div style={S("position:relative;padding:22px 18px 32px;text-align:center;overflow:hidden")}>
        <span style={S("position:absolute;left:30%;top:42%;width:7px;height:11px;background:#4F8A5B;border-radius:2px;animation:apConfA .9s .1s ease-out both")} aria-hidden="true"></span>
        <span style={S("position:absolute;left:45%;top:40%;width:8px;height:8px;background:#C99A3C;border-radius:99px;animation:apConfB .95s .05s ease-out both")} aria-hidden="true"></span>
        <span style={S("position:absolute;left:58%;top:42%;width:7px;height:11px;background:#C2503A;border-radius:2px;animation:apConfC .9s .12s ease-out both")} aria-hidden="true"></span>
        <span style={S("position:absolute;left:38%;top:44%;width:6px;height:6px;background:#1A1A1A;border-radius:99px;animation:apConfB .85s .22s ease-out both")} aria-hidden="true"></span>
        <span style={S("position:absolute;left:64%;top:40%;width:8px;height:8px;background:#4F8A5B;border-radius:99px;animation:apConfA 1s .18s ease-out both")} aria-hidden="true"></span>
        <span style={S("position:absolute;left:50%;top:38%;width:7px;height:11px;background:#C99A3C;border-radius:2px;animation:apConfC 1s .26s ease-out both")} aria-hidden="true"></span>
        <div style={S("position:relative;width:64px;height:64px;margin:4px auto 0")}>
          <span style={S("position:absolute;inset:0;border-radius:999px;border:2.5px solid #4F8A5B;animation:apRing .9s ease-out both")} aria-hidden="true"></span>
          <span style={S("position:absolute;inset:0;border-radius:999px;background:#4F8A5B;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;animation:apCheck .55s cubic-bezier(.34,1.5,.5,1) both")}>✓</span>
        </div>
        <h3 style={S("margin:15px 0 0;font-size:20px;font-weight:800;letter-spacing:-.025em;animation:apUp .4s .15s both")}>Reserva confirmada</h3>
        <p style={S("margin:5px 0 0;font-size:13.5px;color:#5A5A52;animation:apUp .4s .22s both")}>{V.claseNombre} · reformer {V.camaSel}<br />{V.claseDia} · {V.claseHora} · {V.claseEstudio} · {V.claseInst}</p>
        <p style={S("margin:9px 0 0;font-size:11.5px;font-weight:700;color:#2E5A3A;animation:apUp .4s .3s both")}>Bono: te quedan {V.bono} sesiones</p>
        <div style={S("display:flex;gap:8px;justify-content:center;margin-top:16px;animation:apUp .4s .38s both")}>
          <button type="button" onClick={V.tCalendario} style={S("border:1px solid #E5E3DA;background:#fff;border-radius:999px;padding:9px 14px;font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer")}>+ Calendario</button>
          <button type="button" onClick={V.tComoLlegar} style={S("border:1px solid #E5E3DA;background:#fff;border-radius:999px;padding:9px 14px;font-family:inherit;font-size:11.5px;font-weight:800;cursor:pointer")}>Cómo llegar</button>
        </div>
        <button type="button" onClick={V.verMiReserva} style={S("width:100%;height:48px;margin-top:13px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;animation:apUp .4s .46s both")}>Ver mis reservas</button>
      </div>
    </React.Fragment> : null}
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetCancelT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:14px 18px 30px;text-align:center")}>
      <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>¿Cancelar esta clase?</h3>
      <p style={S("margin:5px 0 0;font-size:12.5px;color:#5A5A52")}>{V.claseNombre} · {V.claseDia} {V.claseHora} · {V.claseEstudio}</p>
      {(V.cancelGratis) ? <React.Fragment>
        <div style={S("background:#EAF0E7;border-radius:14px;padding:11px 14px;margin-top:13px;text-align:left")}>
          <p style={S("margin:0;font-size:12px;font-weight:700;color:#2E5A3A")}>Estás dentro del plazo: recuperas la sesión de tu bono al instante.</p>
        </div>
      </React.Fragment> : null}
      {(V.cancelTarde) ? <React.Fragment>
        <div style={S("background:#F6EEDD;border:1px solid #E8D9B5;border-radius:14px;padding:11px 14px;margin-top:13px;text-align:left")}>
          <p style={S("margin:0;font-size:12px;font-weight:700;color:#8A6A25")}>Quedan menos de 12 h: la sesión del bono no se devuelve (política del estudio).</p>
        </div>
      </React.Fragment> : null}
      <button type="button" onClick={V.confirmarCancelar} style={S("width:100%;height:48px;margin-top:13px;border:none;border-radius:999px;background:#C2503A;color:#fff;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer")}>{V.btnCancelTxt}</button>
      <button type="button" onClick={V.cerrarSheet} style={S("width:100%;height:44px;margin-top:8px;border:none;border-radius:999px;background:#EFEDE4;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer")}>Mantener mi reserva</button>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetReagT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:12px 18px 30px")}>
      <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>Cambiar de hora</h3>
      <p style={S("margin:3px 0 13px;font-size:12.5px;color:#5A5A52")}>Ahora: {V.claseNombre} · {V.claseDia} {V.claseHora} — elige otra sin coste</p>
      <div style={S("display:flex;flex-direction:column;gap:8px")}>
        {((V.reagOps)||[]).map((c, $index) => (<React.Fragment key={$index}>
          <button type="button" onClick={c.pasar} style={S("display:flex;align-items:center;gap:11px;width:100%;box-sizing:border-box;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:11px 13px;font-family:inherit;cursor:pointer;text-align:left;animation:apUp .3s both")}>
            <span style={S("font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:13px;min-width:42px")}>{c.hora}</span>
            <span style={S("flex:1")}><span style={S("display:block;font-size:12.5px;font-weight:800")}>{c.nombre}</span><span style={S("display:block;font-size:10.5px;color:#5A5A52")}>{c.inst} · {c.diaTxt}</span></span>
            <span style={c.badgeCss}>{c.badge}</span>
          </button>
        </React.Fragment>))}
        {(V.sinReagOps) ? <React.Fragment>
          <p style={S("margin:0;text-align:center;font-size:12px;color:#98A093;padding:10px 0")}>No quedan otras horas libres ese día — prueba mañana.</p>
        </React.Fragment> : null}
      </div>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetValorarT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:14px 18px 30px;text-align:center")}>
      <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>¿Qué tal la clase del sábado?</h3>
      <p style={S("margin:4px 0 0;font-size:12.5px;color:#5A5A52")}>Reformer · Studio Alma · Marta G.</p>
      <div style={S("display:flex;justify-content:center;gap:6px;margin-top:14px")}>
        <button type="button" onClick={V.est1} style={V.estCss1}>★</button>
        <button type="button" onClick={V.est2} style={V.estCss2}>★</button>
        <button type="button" onClick={V.est3} style={V.estCss3}>★</button>
        <button type="button" onClick={V.est4} style={V.estCss4}>★</button>
        <button type="button" onClick={V.est5} style={V.estCss5}>★</button>
      </div>
      <div style={S("display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-top:13px")}>
        <button type="button" onClick={V.chipG} style={V.chipGCss}>Corrige mucho 💪</button>
        <button type="button" onClick={V.chipA} style={V.chipACss}>Ambiente 10</button>
        <button type="button" onClick={V.chipD} style={V.chipDCss}>Intensa pero bien</button>
      </div>
      <button type="button" onClick={V.enviarValoracion} style={V.btnValorarCss}>Enviar valoración</button>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetNotifT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:14px 18px 30px")}>
      <h3 style={S("margin:0 0 11px;font-size:17px;font-weight:800;letter-spacing:-.02em")}>Notificaciones</h3>
      <div style={S("display:flex;flex-direction:column;gap:8px")}>
        {(V.notifLiberada) ? <React.Fragment>
          <button type="button" onClick={V.abrirLiberada} style={S("display:flex;gap:10px;background:#EAF0E7;border:1px solid #CFE0CE;border-radius:14px;padding:11px 13px;font-family:inherit;cursor:pointer;text-align:left;animation:apPop .4s both")}>
            <span style={S("font-size:15px")}>🎉</span>
            <span style={S("flex:1")}><span style={S("display:block;font-size:12.5px;font-weight:800;color:#2E5A3A")}>¡Se ha liberado una plaza!</span><span style={S("display:block;font-size:11px;color:#5A5A52;margin-top:1px")}>Reformer · suave · hoy 20:30 — reserva antes de que vuele.</span></span>
            <span style={S("align-self:center;font-size:13px;color:#2E5A3A")}>›</span>
          </button>
        </React.Fragment> : null}
        <div style={S("display:flex;gap:10px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px")}>
          <span style={S("font-size:15px")}>⏰</span>
          <span style={S("flex:1")}><span style={S("display:block;font-size:12.5px;font-weight:800")}>Recordatorio</span><span style={S("display:block;font-size:11px;color:#5A5A52;margin-top:1px")}>Tu bono caduca el 12 de octubre — te quedan {V.bono} sesiones.</span></span>
        </div>
        <div onClick={V.abrirValorar} style={S("display:flex;gap:10px;background:#fff;border:1px solid #E5E3DA;border-radius:14px;padding:11px 13px;cursor:pointer")}>
          <span style={S("font-size:15px")}>⭐</span>
          <span style={S("flex:1")}><span style={S("display:block;font-size:12.5px;font-weight:800")}>Valora tu última clase</span><span style={S("display:block;font-size:11px;color:#5A5A52;margin-top:1px")}>Reformer del sábado con Marta G. — ayuda al estudio.</span></span>
        </div>
      </div>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:52;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetOfertaT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} style={S("padding:9px 14px 5px;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:10px 18px 30px;text-align:center")}>
      <span style={S("display:inline-block;background:#EAF0E7;color:#2E5A3A;border-radius:999px;padding:5px 13px;font-size:11px;font-weight:800;animation:apPop .4s both")}>🎉 Plaza liberada — reservada para ti</span>
      <h3 style={S("margin:12px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em")}>Reformer · suave</h3>
      <p style={S("margin:4px 0 0;font-size:12.5px;color:#5A5A52")}>hoy 20:30 · Studio Alma · Lucía R.</p>
      <p style={S("margin:16px 0 0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:34px;font-weight:500;letter-spacing:.06em;animation:apPulse 2s infinite")}>{V.ofertaTxt}</p>
      <p style={S("margin:2px 0 0;font-size:10.5px;color:#98A093")}>para aceptarla — después pasa a la siguiente de la lista</p>
      <button type="button" onClick={V.aceptarOferta} style={S("width:100%;height:50px;margin-top:16px;border:none;border-radius:999px;background:#4F8A5B;color:#fff;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer")}>Aceptar la plaza con mi bono</button>
      <button type="button" onClick={V.rechazarOferta} style={S("width:100%;height:44px;margin-top:8px;border:none;border-radius:999px;background:#EFEDE4;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer")}>Dejarla pasar</button>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetLogroT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:8px 18px 32px;text-align:center")}>
      <span style={V.logroECss}>{V.logroE}</span>
      <h3 style={S("margin:10px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em")}>{V.logroN}</h3>
      <p style={S("margin:6px 0 0;font-size:12.5px;line-height:1.55;color:#5A5A52;max-width:34ch;margin-left:auto;margin-right:auto")}>{V.logroD}</p>
      <div style={S("height:7px;border-radius:99px;background:#EFEDE4;margin:16px 20px 0;overflow:hidden")}><div style={V.logroBarra}></div></div>
      <p style={S("margin:7px 0 0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:11.5px;color:#5A5A52")}>{V.logroTxt}</p>
      <span style={V.logroEstadoCss}>{V.logroEstado}</span>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetEmailT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    {(V.emailForm) ? <React.Fragment>
      <div style={S("padding:12px 18px 30px")}>
        <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>Cambiar email</h3>
        <p style={S("margin:3px 0 13px;font-size:12px;color:#5A5A52")}>Ahora: <b style={S("color:#1A1A1A")}>{V.ajEmail}</b>. Te enviamos un código al nuevo para confirmarlo.</p>
        <input value={V.emailNuevo} onChange={V.onEmailNuevo} placeholder="nuevo@email.com" style={S("width:100%;box-sizing:border-box;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:13px 15px;font-family:inherit;font-size:15px;font-weight:600;color:#1A1A1A;outline:none")} />
        <button type="button" onClick={V.enviarCodEmail} style={S("width:100%;height:48px;margin-top:12px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer")}>Enviarme el código</button>
      </div>
    </React.Fragment> : null}
    {(V.emailCodPaso) ? <React.Fragment>
      <div style={S("padding:12px 18px 30px")}>
        <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>Revisa tu correo</h3>
        <p style={S("margin:3px 0 13px;font-size:12px;color:#5A5A52")}>Código enviado a <b style={S("color:#1A1A1A")}>{V.emailNuevo}</b> · en la demo es <b style={S("color:#1A1A1A")}>4729</b></p>
        <input value={V.emailCod} onChange={V.onEmailCod} placeholder="Código de 4 dígitos" style={S("width:100%;box-sizing:border-box;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:13px 15px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:17px;letter-spacing:.3em;color:#1A1A1A;outline:none")} />
        <button type="button" onClick={V.confirmarEmail} style={S("width:100%;height:48px;margin-top:12px;border:none;border-radius:999px;background:#3E6B4A;color:#FAF9F5;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer")}>Confirmar cambio</button>
      </div>
    </React.Fragment> : null}
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetPassT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:12px 18px 30px")}>
      <h3 style={S("margin:0 0 13px;font-size:18px;font-weight:800;letter-spacing:-.02em")}>Cambiar contraseña</h3>
      <input value={V.passA} onChange={V.onPassA} type="password" placeholder="Contraseña actual" style={S("width:100%;box-sizing:border-box;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:13px 15px;font-family:inherit;font-size:14.5px;color:#1A1A1A;outline:none")} />
      <input value={V.passN} onChange={V.onPassN} type="password" placeholder="Nueva contraseña (mín. 8)" style={S("width:100%;box-sizing:border-box;margin-top:9px;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:13px 15px;font-family:inherit;font-size:14.5px;color:#1A1A1A;outline:none")} />
      <p style={V.passFuerzaCss}>Fuerza: {V.passFuerza}</p>
      <input value={V.passR} onChange={V.onPassR} type="password" placeholder="Repite la nueva" style={S("width:100%;box-sizing:border-box;margin-top:9px;background:#fff;border:1.5px solid #E5E3DA;border-radius:14px;padding:13px 15px;font-family:inherit;font-size:14.5px;color:#1A1A1A;outline:none")} />
      <button type="button" onClick={V.guardarPass} style={S("width:100%;height:48px;margin-top:12px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer")}>Guardar contraseña</button>
      <p style={S("margin:9px 0 0;text-align:center;font-size:10.5px;color:#98A093")}>Cerraremos tu sesión en otros dispositivos.</p>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetPaseT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:10px 18px 30px;text-align:center")}>
      <p style={S("margin:0;font-size:15.5px;font-weight:800;letter-spacing:-.02em")}>Tu pase de acceso</p>
      <p style={S("margin:3px 0 0;font-size:11.5px;color:#5A5A52")}>Studio Alma · {V.claseNombre} · {V.claseHora}</p>
      {(V.paseActivo) ? <React.Fragment>
        <div style={S("width:168px;height:168px;margin:16px auto 0;background:#fff;border:1.5px solid #E5E3DA;border-radius:18px;display:flex;align-items:center;justify-content:center;animation:apPop .4s both")}>
          <svg viewBox="0 0 25 25" width="132" height="132" aria-label="Código QR del pase" style={S("display:block")}>
            <rect x="0" y="0" width="7" height="7" fill="#1A1A1A"></rect><rect x="1.5" y="1.5" width="4" height="4" fill="#FAF9F5"></rect><rect x="2.5" y="2.5" width="2" height="2" fill="#1A1A1A"></rect>
            <rect x="18" y="0" width="7" height="7" fill="#1A1A1A"></rect><rect x="19.5" y="1.5" width="4" height="4" fill="#FAF9F5"></rect><rect x="20.5" y="2.5" width="2" height="2" fill="#1A1A1A"></rect>
            <rect x="0" y="18" width="7" height="7" fill="#1A1A1A"></rect><rect x="1.5" y="19.5" width="4" height="4" fill="#FAF9F5"></rect><rect x="2.5" y="20.5" width="2" height="2" fill="#1A1A1A"></rect>
            <path fill="#1A1A1A" d="M9 0h2v2H9zM13 0h2v3h-2zM9 3h3v2H9zM14 4h2v2h-2zM9 6h2v3H9zM12 7h3v2h-3zM0 9h2v2H0zM3 9h3v3H3zM7 10h2v2H7zM10 10h2v2h-2zM13 10h3v2h-3zM17 9h2v3h-2zM20 9h2v2h-2zM23 10h2v2h-2zM1 13h3v2H1zM5 14h2v2H5zM8 13h2v3H8zM11 13h2v2h-2zM14 14h3v2h-3zM18 13h2v2h-2zM21 13h3v3h-3zM9 17h3v2H9zM13 18h2v2h-2zM16 17h2v3h-2zM19 18h3v2h-3zM23 17h2v2h-2zM9 20h2v3H9zM12 21h3v2h-3zM16 21h2v3h-2zM19 22h2v2h-2zM22 21h3v2h-3z"></path>
          </svg>
        </div>
        <p style={S("margin:14px 0 0;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:22px;letter-spacing:.34em;font-weight:500")}>{V.paseCodigo}</p>
        <p style={S("margin:4px 0 0;font-size:10.5px;color:#98A093")}>Si la cámara falla, di este código en recepción</p>
        <p style={S("display:flex;align-items:center;justify-content:center;gap:7px;margin:12px 0 0;font-size:11px;font-weight:700;color:#5A5A52")}><span style={S("width:6px;height:6px;border-radius:99px;background:#4F8A5B;animation:apPulse 1.6s infinite")}></span>Se renueva solo · caduca en 2 min</p>
      </React.Fragment> : null}
      {(V.paseDentro) ? <React.Fragment>
        <div style={S("position:relative;width:64px;height:64px;margin:22px auto 0")}>
          <span style={S("position:absolute;inset:0;border-radius:999px;border:2.5px solid #4F8A5B;animation:apRing .9s ease-out both")}></span>
          <span style={S("position:absolute;inset:0;border-radius:999px;background:#4F8A5B;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;animation:apCheck .55s cubic-bezier(.34,1.5,.5,1) both")}>✓</span>
        </div>
        <h3 style={S("margin:14px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em;animation:apUp .4s .15s both")}>Ya estás dentro</h3>
        <p style={S("margin:5px 0 0;font-size:12.5px;color:#5A5A52;animation:apUp .4s .22s both")}>Recepción ha validado tu pase. ¡Buena clase!</p>
        <button type="button" onClick={V.cerrarSheet} style={S("width:100%;height:46px;margin-top:16px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer;animation:apUp .4s .3s both")}>Cerrar</button>
      </React.Fragment> : null}
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetPfT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} style={S("padding:9px 14px 5px;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    <div style={S("padding:12px 18px 30px;text-align:center")}>
      <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>¿Dar de baja tu plaza fija?</h3>
      <p style={S("margin:5px 0 0;font-size:12.5px;color:#5A5A52")}>Martes 19:30 · Reformer · sala 1. Dejarás de tener el sitio reservado cada semana.</p>
      <button type="button" onClick={V.confirmarPfBaja} style={S("width:100%;height:48px;margin-top:14px;border:none;border-radius:999px;background:#C2503A;color:#fff;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer")}>Sí, darla de baja</button>
      <button type="button" onClick={V.cerrarSheet} style={S("width:100%;height:44px;margin-top:8px;border:none;border-radius:999px;background:#EFEDE4;font-family:inherit;font-size:13px;font-weight:800;cursor:pointer")}>Conservarla</button>
    </div>
  </div>

  
  <div style={S(`position:absolute;left:0;right:0;bottom:0;z-index:51;background:#FAF9F5;border-radius:24px 24px 0 0;box-shadow:0 -18px 50px rgba(15,15,15,.25);transform:${V.sheetPagoT};transition:${V.shTrans}`)}>
    <div onClick={V.cerrarSheet} onPointerDown={V.shPD} onPointerMove={V.shPM} onPointerUp={V.shPU} style={S("padding:9px 14px 5px;touch-action:none;cursor:grab")}><div style={S("width:34px;height:4px;border-radius:99px;background:#D9D6C9;margin:0 auto")}></div></div>
    {(V.pgElige) ? <React.Fragment>
      <div style={S("padding:12px 18px 30px")}>
        <h3 style={S("margin:0;font-size:18px;font-weight:800;letter-spacing:-.02em")}>Bonos de Studio Alma</h3>
        <p style={S("margin:3px 0 13px;font-size:12px;color:#5A5A52")}>Precios de ejemplo · sin caducidad sorpresa: 90 días y te avisamos antes</p>
        <div style={S("display:flex;flex-direction:column;gap:9px")}>
          <button type="button" onClick={V.selB5} style={V.b5Css}>
            <span style={S("flex:1;text-align:left")}><span style={S("display:block;font-size:14px;font-weight:800")}>Bono 5 sesiones</span><span style={S("display:block;font-size:11px;opacity:.7")}>15,80 € por clase</span></span>
            <span style={S("font-size:16px;font-weight:800")}>79 €</span>
          </button>
          <button type="button" onClick={V.selB10} style={V.b10Css}>
            <span style={S("flex:1;text-align:left")}><span style={S("display:block;font-size:14px;font-weight:800")}>Bono 10 sesiones <span style={S("background:#EAF0E7;color:#2E5A3A;font-size:9px;font-weight:800;padding:2px 7px;border-radius:99px;vertical-align:2px")}>−12%</span></span><span style={S("display:block;font-size:11px;opacity:.7")}>14,90 € por clase</span></span>
            <span style={S("font-size:16px;font-weight:800")}>149 €</span>
          </button>
        </div>
        <p style={S("margin:13px 0 6px;font-family:var(--font-plex-mono),ui-monospace,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#98A093")}>Pago</p>
        <div style={S("display:flex;gap:8px")}>
          <button type="button" onClick={V.metVisa} style={V.mVisaCss}>💳 ···· 4242</button>
          <button type="button" onClick={V.metApple} style={V.mAppleCss}> Pay</button>
        </div>
        <button type="button" onClick={V.pagar} style={S("width:100%;height:52px;margin-top:14px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:14.5px;font-weight:800;cursor:pointer")}>{V.pagarTxt}</button>
        <p style={S("margin:9px 0 0;text-align:center;font-size:10.5px;color:#98A093")}>Recibo por email · el bono se activa al momento</p>
      </div>
    </React.Fragment> : null}
    {(V.pgProc) ? <React.Fragment>
      <div style={S("padding:34px 18px 52px;text-align:center")}>
        <span style={S("display:inline-block;width:46px;height:46px;border-radius:999px;border:3px solid #E5E3DA;border-top-color:#635BFF;animation:apSpin .9s linear infinite")}></span>
        <p style={S("margin:14px 0 0;font-size:13.5px;font-weight:800")}>Conectando con Stripe…</p>
        <p style={S("margin:4px 0 0;font-size:11.5px;color:#98A093")}>{V.pagoMetodoTxt} · conexión segura</p>
      </div>
    </React.Fragment> : null}
    {(V.pgOk) ? <React.Fragment>
      <div style={S("padding:22px 18px 32px;text-align:center")}>
        <div style={S("position:relative;width:60px;height:60px;margin:0 auto")}>
          <span style={S("position:absolute;inset:0;border-radius:999px;border:2.5px solid #4F8A5B;animation:apRing .9s ease-out both")}></span>
          <span style={S("position:absolute;inset:0;border-radius:999px;background:#4F8A5B;color:#fff;font-size:26px;display:flex;align-items:center;justify-content:center;animation:apCheck .55s cubic-bezier(.34,1.5,.5,1) both")}>✓</span>
        </div>
        <h3 style={S("margin:14px 0 0;font-size:19px;font-weight:800;letter-spacing:-.02em;animation:apUp .4s .15s both")}>Pago completado</h3>
        <p style={S("margin:5px 0 0;font-size:13px;color:#5A5A52;animation:apUp .4s .22s both")}>{V.pagoResumen}</p>
        <p style={S("margin:8px 0 0;font-size:11.5px;font-weight:700;color:#2E5A3A;animation:apUp .4s .3s both")}>Tu bono aparece aquí en cuanto el estudio lo registra — te avisamos.</p>
        <button type="button" onClick={V.cerrarSheet} style={S("width:100%;height:48px;margin-top:16px;border:none;border-radius:999px;background:#1A1A1A;color:#F1ECE1;font-family:inherit;font-size:13.5px;font-weight:800;cursor:pointer;animation:apUp .4s .38s both")}>Listo</button>
      </div>
    </React.Fragment> : null}
  </div>

</div>

    </div>
  </React.Fragment>);
};

export default Component;
