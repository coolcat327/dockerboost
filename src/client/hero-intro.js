// Animate a decorative copy so the real illustration always reserves its layout.
export const initHeroIntro = () => {
  const art = document.querySelector('.boost-art');
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!art || reduced.matches || document.hidden || window.scrollY > 0 || location.hash || typeof art.animate !== 'function') return;
  let overlay;
  let animation;
  let fade;
  let timer;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    art.removeEventListener('load', start);
    art.removeEventListener('error', finish);
    for (const type of ['scroll', 'resize', 'pointerdown', 'keydown', 'pagehide']) window.removeEventListener(type, finish);
    document.removeEventListener('visibilitychange', onVisibility);
    reduced.removeEventListener('change', finish);
    animation?.cancel();
    fade?.cancel();
    overlay?.remove();
    root.classList.remove('hero-intro-active');
  };
  const onVisibility = () => { if (document.hidden) finish(); };
  const start = () => {
    clearTimeout(timer);
    if (finished || reduced.matches || document.hidden || window.scrollY > 0 || !art.naturalWidth) return finish();
    const rect = art.getBoundingClientRect();
    if (!rect.width || !rect.height) return finish();
    const scale = Math.min(1.3, (window.innerWidth - 32) / rect.width, (window.innerHeight - 32) / rect.height);
    const x = (window.innerWidth - rect.width) / 2 - rect.left;
    const y = (window.innerHeight - rect.height) / 2 - rect.top;
    try {
      overlay = document.createElement('div');
      overlay.className = 'hero-intro-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      const copy = art.cloneNode(false);
      copy.className = 'hero-intro-art';
      copy.removeAttribute('id');
      Object.assign(copy.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      overlay.append(copy);
      document.body.append(overlay);
      root.classList.add('hero-intro-active');
      animation = copy.animate([
        { transform: `translate(${x}px, ${y}px) scale(${scale})` },
        { transform: 'translate(0px, 0px) scale(1)' },
      ], { duration: 1050, delay: 400, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'both' });
      fade = overlay.animate([{ backgroundColor: '#090a0c' }, { backgroundColor: '#090a0c' , offset: .35 }, { backgroundColor: '#090a0c00' }], { duration: 1450, fill: 'both' });
      animation.finished.then(finish, finish);
      timer = setTimeout(finish, 2000);
    } catch { finish(); }
  };
  for (const type of ['scroll', 'resize', 'pointerdown', 'keydown', 'pagehide']) window.addEventListener(type, finish, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', finish);
  if (art.complete) start();
  else {
    art.addEventListener('load', start, { once: true });
    art.addEventListener('error', finish, { once: true });
    timer = setTimeout(finish, 1500);
  }
};
