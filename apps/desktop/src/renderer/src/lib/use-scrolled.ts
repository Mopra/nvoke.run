import { useEffect, useState, type RefObject } from 'react';

/**
 * True once the element has scrolled away from the top. The toolbar shows its
 * hairline only then, so a page at rest has no line under its title.
 */
export function useScrolled(ref: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setScrolled(el.scrollTop > 2);
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [ref]);
  return scrolled;
}
