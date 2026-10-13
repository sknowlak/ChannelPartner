import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Open/closed state of the sidebar drawer used below 900px wide. Closes on
// navigation and on Escape.
export function useNavDrawer() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return { open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) };
}

// Click-away layer behind the open drawer.
export function NavBackdrop({ open, onClose }) {
  return open ? <div className="nav-backdrop" onClick={onClose} aria-hidden="true" /> : null;
}

// Hamburger button in the top bar; hidden by CSS on wide screens.
export default function MenuButton({ open, onClick, label }) {
  return (
    <button type="button" className="menu-toggle" onClick={onClick} aria-label={label} aria-expanded={open}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}
