'use client';

import { useEffect, useState } from 'react';
import { ACC } from './theme';
import { SPINE_SECTIONS } from './data';

export function SpineNav() {
  const [activeSpine, setActiveSpine] = useState('hero');

  useEffect(() => {
    const els = SPINE_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSpine(entry.target.id);
        });
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="tnt-spine" aria-hidden="true" style={{ position: 'fixed', left: 26, top: '50%', transform: 'translateY(-50%)', zIndex: 80, flexDirection: 'column', alignItems: 'center' }}>
      {SPINE_SECTIONS.map((s) => {
        const on = activeSpine === s.id;
        return (
          <button
            key={s.id}
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            aria-label={`Ir a ${s.label}`}
            className={`tnt-spine-dot${on ? ' on' : ''}`}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: on ? ACC : '#C9C9BE',
              margin: '12px 0',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              transform: on ? 'scale(1.6)' : 'none',
              boxShadow: on ? '0 0 0 5px rgba(109,40,217,.16)' : 'none',
              transition: 'background .3s, transform .3s, box-shadow .3s',
              position: 'relative',
            }}
          >
            <span className="tnt-spine-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
