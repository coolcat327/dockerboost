// Decorative motion never controls content visibility or task state.
export const initPageMotion = () => {
  const root = document.documentElement;
  const hero = document.querySelector('.hero');
  const stage = document.querySelector('.tool-stage');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = window.matchMedia('(min-width: 821px) and (hover: hover) and (pointer: fine)');
  let inView = true;
  let frame = 0;
  const pending = new Map();
  const reset = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    pending.clear();
    for (const element of [hero, stage]) {
      for (const name of ['--pointer-x', '--pointer-y', '--art-x', '--art-y']) element?.style.removeProperty(name);
      element?.classList.remove('has-pointer');
    }
  };
  const sync = () => {
    root.classList.toggle('motion-paused', document.hidden || reduced.matches || !inView);
    if (document.hidden || reduced.matches || !pointer.matches || !inView) reset();
  };
  const bind = (element, isHero) => {
    element?.addEventListener('pointermove', (event) => {
      if (document.hidden || reduced.matches || !pointer.matches || (isHero && !inView)) return;
      pending.set(element, { x: event.clientX, y: event.clientY, isHero });
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const [target, position] of pending) {
          const rect = target.getBoundingClientRect();
          const x = Math.max(0, Math.min(rect.width, position.x - rect.left));
          const y = Math.max(0, Math.min(rect.height, position.y - rect.top));
          target.style.setProperty('--pointer-x', `${x}px`);
          target.style.setProperty('--pointer-y', `${y}px`);
          if (position.isHero && rect.width && rect.height) {
            target.style.setProperty('--art-x', `${(x / rect.width - .5) * 12}px`);
            target.style.setProperty('--art-y', `${(y / rect.height - .5) * 12}px`);
          }
          target.classList.add('has-pointer');
        }
        pending.clear();
      });
    });
    element?.addEventListener('pointerleave', () => {
      pending.delete(element);
      element.classList.remove('has-pointer');
      for (const name of ['--art-x', '--art-y']) element.style.removeProperty(name);
    });
  };
  bind(hero, true);
  bind(stage, false);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  pointer.addEventListener('change', sync);
  if (hero && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
    observer.observe(hero);
  }
  sync();
};
