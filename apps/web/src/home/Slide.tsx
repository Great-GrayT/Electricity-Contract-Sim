import type { ReactNode } from 'react';
import type { SlideTheme } from './home-deck.data';

interface SlideProps {
  id: string;
  theme: SlideTheme;
  labelledBy: string;
  children: ReactNode;
}

export function Slide({ id, theme, labelledBy, children }: SlideProps) {
  return (
    <section
      id={id}
      className={`slide slide--${theme}`}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  );
}
