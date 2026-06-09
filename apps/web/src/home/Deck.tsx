import { useCallback, useEffect, useRef, useState } from 'react';
import { SECTIONS, SLIDES } from './home-deck.data';
import { SlideCover, SlideExposure } from './sections/SectionA';
import {
  SlideMarket, SlideVolatile, SlideTransition,
  SlideShape, SlideSeasonality, SlideCannib,
} from './sections/SectionB';
import {
  SlideFoundation, SlideTailKit, SlideExotics,
  SlidePPA, SlideRevenue, SlidePhysical, SlideWeather,
} from './sections/SectionC';
import { SlideStack, SlideMatrix, SlideEvidence } from './sections/SectionD';
import { SlideDials, SlideP2P, SlideClose } from './sections/SectionE';

const SLIDE_COMPONENTS = [
  SlideCover, SlideExposure,
  SlideMarket, SlideVolatile, SlideTransition, SlideShape, SlideSeasonality, SlideCannib,
  SlideFoundation, SlideTailKit, SlideExotics, SlidePPA, SlideRevenue, SlidePhysical, SlideWeather,
  SlideStack, SlideMatrix, SlideEvidence,
  SlideDials, SlideP2P, SlideClose,
];

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollToSlide(index: number) {
  const el = document.getElementById(SLIDES[index].id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'instant' : 'smooth', block: 'start' });
}

// ---------- Progress Rail ----------

interface RailProps {
  current: number;
  onDotClick: (i: number) => void;
}

function ProgressRail({ current, onDotClick }: RailProps) {
  return (
    <nav className="progress-rail" aria-label="Slide navigation">
      {SECTIONS.map((section) => {
        const sectionSlides = SLIDES.filter((s) => s.section === section);
        return (
          <div key={section} className="progress-section-group">
            <span className="progress-section-label" aria-hidden="true">{section}</span>
            {sectionSlides.map((slide) => {
              const idx = SLIDES.findIndex((s) => s.id === slide.id);
              return (
                <button
                  key={slide.id}
                  className="progress-dot"
                  aria-label={`Go to: ${slide.title}`}
                  aria-current={current === idx ? 'true' : undefined}
                  onClick={() => onDotClick(idx)}
                >
                  <span className="progress-dot__tip">{slide.title}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

// ---------- Deck ----------

export function Deck() {
  const [current, setCurrent] = useState(0);
  const [scrollHintHidden, setScrollHintHidden] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);

  // Track current slide via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = SLIDES.findIndex((s) => s.id === entry.target.id);
            if (idx !== -1) setCurrent(idx);
          }
        }
      },
      { threshold: 0.5 }
    );
    for (const slide of SLIDES) {
      const el = document.getElementById(slide.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  // Hide scroll hint on first scroll
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    function onScroll() {
      if (deck!.scrollTop > 40) setScrollHintHidden(true);
    }
    deck.addEventListener('scroll', onScroll, { passive: true });
    return () => deck.removeEventListener('scroll', onScroll);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const active = document.activeElement;
    const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if (inInput) return;

    let next = current;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      next = Math.min(current + 1, SLIDES.length - 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      next = Math.max(current - 1, 0);
    } else if (e.key === 'Home') {
      e.preventDefault();
      next = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      next = SLIDES.length - 1;
    } else {
      return;
    }
    scrollToSlide(next);
    setCurrent(next);
  }, [current]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <main id="main-content">
        <div className="deck" ref={deckRef}>
          {SLIDE_COMPONENTS.map((SlideComp, i) => (
            <SlideComp key={SLIDES[i].id} />
          ))}

          {/* scroll hint is rendered inside SlideCover but we control its class here */}
          <style>{`.scroll-hint { display: ${scrollHintHidden ? 'none' : 'flex'}; }`}</style>
        </div>
      </main>

      <ProgressRail current={current} onDotClick={scrollToSlide} />
    </>
  );
}
