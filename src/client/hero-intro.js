// Animate a decorative copy so the real illustration always reserves its layout.
export const initHeroIntro = () => {
  const art = document.querySelector('.boost-art');
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!art || reduced.matches || window.scrollY > 0 || location.hash || typeof art.animate !== 'function') return Promise.resolve();
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  let overlay;
  let animation;
  let fade;
  let timer;
  let finished = false;
  let preparing = false;
  const viewportWidth = window.innerWidth;
  const finish = () => {
    if (finished) return;
    finished = true;
    release();
    clearTimeout(timer);
    art.removeEventListener('load', start);
    art.removeEventListener('error', finish);
    for (const type of ['scroll', 'pointerdown', 'keydown', 'pagehide']) window.removeEventListener(type, finish);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    reduced.removeEventListener('change', finish);
    animation?.cancel();
    fade?.cancel();
    overlay?.remove();
    root.classList.remove('hero-intro-active');
  };
  const onResize = () => { if (window.innerWidth !== viewportWidth) finish(); };
  const onVisibility = () => {
    if (document.hidden) { release(); if (overlay) finish(); }
    else if (art.complete) start();
  };
  const start = () => {
    if (finished || overlay || preparing) return;
    if (document.hidden) return;
    if (reduced.matches || window.scrollY > 0 || !art.naturalWidth) return finish();
    preparing = true;
    // load/complete alone does not guarantee that the image is ready to paint.
    if (typeof art.decode === 'function') art.decode().then(prepare, finish);
    else prepare();
  };
  const prepare = () => {
    if (finished) return;
    const copy = art.cloneNode(false);
    copy.className = 'hero-intro-art';
    copy.removeAttribute('id');
    // Decode the decorative element too, before hiding the original image.
    if (typeof copy.decode === 'function') copy.decode().then(() => show(copy), finish);
    else show(copy);
  };
  const show = (copy) => {
    if (finished) return;
    if (document.hidden) { preparing = false; return; }
    clearTimeout(timer);
    const rect = art.getBoundingClientRect();
    if (!rect.width || !rect.height) return finish();
    const scale = Math.min(1.3, (window.innerWidth - 32) / rect.width, (window.innerHeight - 32) / rect.height);
    const x = (window.innerWidth - rect.width) / 2 - rect.left;
    const y = (window.innerHeight - rect.height) / 2 - rect.top;
    try {
      overlay = document.createElement('div');
      overlay.className = 'hero-intro-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      const backdrop = document.createElement('div');
      backdrop.className = 'hero-intro-backdrop';
      Object.assign(copy.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      overlay.append(backdrop, copy);
      document.body.append(overlay);
      root.classList.add('hero-intro-active');
      animation = copy.animate([
        { transform: `translate(${x}px, ${y}px) scale(${scale})` },
        { transform: 'translate(0px, 0px) scale(1)' },
      ], { duration: 1050, delay: 400, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'both' });
      fade = backdrop.animate([{ opacity: 1 }, { opacity: 1, offset: .35 }, { opacity: 0 }], { duration: 1450, fill: 'both' });
      // A second frame gives the browser a paint opportunity before importing tools.
      requestAnimationFrame(() => requestAnimationFrame(release));
      animation.finished.then(finish, finish);
      timer = setTimeout(finish, 2000);
    } catch { finish(); }
  };
  for (const type of ['scroll', 'pointerdown', 'keydown', 'pagehide']) window.addEventListener(type, finish, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', finish);
  // Bound tool startup, not image readiness: a cold download/decode may take
  // longer, but should still play unless an interaction or failure cancels it.
  if (!document.hidden) timer = setTimeout(release, 1500);
  if (!art.complete) {
    art.addEventListener('load', start, { once: true });
    art.addEventListener('error', finish, { once: true });
  }
  // Hidden pages release tools immediately and start the intro when visible.
  onVisibility();
  return ready;
};
