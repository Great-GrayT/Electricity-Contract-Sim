import { useEffect, useRef, useState } from 'react';
import { Menu, X, Sun, Moon } from 'lucide-react';
import type { View } from './home-deck.data';
import { useTheme } from '../lib/theme';

interface NavBarProps {
  view: View;
  onNav: (v: View) => void;
  scrolled: boolean;
}

const APP_LINKS: { label: string; view: View }[] = [
  { label: 'Home', view: 'home' },
  { label: 'Data', view: 'dashboard' },
  { label: 'Analysis', view: 'analysis' },
  { label: 'Replay', view: 'replay' },
];

const PLACEHOLDER_LINKS = [''];

export function NavBar({ view, onNav, scrolled }: NavBarProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;
    const focusable = el.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    focusable[0]?.focus();

    function trap(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        hamburgerRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = Array.from(focusable);
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  function handleNav(v: View) {
    onNav(v);
    setOpen(false);
  }

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>

      <nav className={`navbar${scrolled ? ' scrolled' : ''}`} aria-label="Site navigation">
        <button className="navbar-brand" onClick={() => handleNav('home')} aria-label="UrbanChain home">
        </button>

        <div className="navbar-spacer" />

        <ul className="navbar-links" role="list">
          {APP_LINKS.map(({ label, view: v }) => (
            <li key={v}>
              <button
                className={view === v ? 'nav-active' : undefined}
                aria-current={view === v ? 'page' : undefined}
                onClick={() => handleNav(v)}
              >
                {label}
              </button>
            </li>
          ))}
          <li aria-hidden="true"><div className="navbar-divider" /></li>
          {PLACEHOLDER_LINKS.map((label) => (
            <li key={label}>
              <a href="#" onClick={(e) => e.preventDefault()} aria-label={`${label} (coming soon)`}>
                {label}
              </a>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="navbar-theme-toggle"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-pressed={theme === 'dark'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={16} color="var(--ice)" /> : <Moon size={16} color="var(--ice)" />}
        </button>

        <button
          ref={hamburgerRef}
          type="button"
          className="navbar-hamburger"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={18} color="var(--ice)" /> : <Menu size={18} color="var(--ice)" />}
        </button>
      </nav>

      <div
        id="mobile-menu"
        ref={menuRef}
        className={`navbar-mobile-menu${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {APP_LINKS.map(({ label, view: v }) => (
          <button
            key={v}
            className={view === v ? 'nav-active' : undefined}
            aria-current={view === v ? 'page' : undefined}
            onClick={() => handleNav(v)}
          >
            {label}
          </button>
        ))}
        <div className="navbar-mobile-divider" />
        {PLACEHOLDER_LINKS.map((label) => (
          <a key={label} href="#" onClick={(e) => e.preventDefault()} aria-label={`${label} (coming soon)`}>
            {label}
          </a>
        ))}
        <div className="navbar-mobile-divider" />
        <button
          type="button"
          className="navbar-mobile-theme-toggle"
          aria-pressed={theme === 'dark'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </>
  );
}
