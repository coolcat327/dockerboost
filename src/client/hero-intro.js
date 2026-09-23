import { gsap } from 'gsap';

export const initHeroIntro = () => {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const visual = document.querySelector('.hero-visual');
    const art = visual?.querySelector('.boost-art');
    if (!visual || !art || window.scrollY > 0 || location.hash) return;
    const content = document.querySelectorAll('.nav, .hero-copy, .workspace, footer');
    gsap.set(content, { autoAlpha: 0 });
    gsap.set(visual, { autoAlpha: 0 });
    let timeline;
    let moved = false;
    const showPage = () => {
      window.removeEventListener('resize', showPage);
      window.removeEventListener('scroll', onScroll);
      art.removeEventListener('load', start);
      art.removeEventListener('error', showPage);
      timeline?.kill();
      if (moved) {
        visual.append(art);
        gsap.set(art, { clearProps: 'all' });
        moved = false;
      }
      gsap.set(visual, { clearProps: 'height,visibility,opacity' });
      gsap.set(content, { clearProps: 'visibility,opacity,transform' });
    };
    const onScroll = () => {
      if (window.scrollY > 0) showPage();
    };
    const start = () => {
      if (window.scrollY > 0) return showPage();
      const destination = art.getBoundingClientRect();
      if (!destination.width || !destination.height) return showPage();
      const visualHeight = visual.getBoundingClientRect().height;
      const introScale = Math.min(1.3, (innerWidth - 32) / destination.width, (innerHeight - 32) / destination.height);
      const x = (innerWidth - destination.width) / 2 - destination.left;
      const y = (innerHeight - destination.height) / 2 - destination.top;

      gsap.set(visual, { height: visualHeight });
      document.body.append(art);
      moved = true;
      gsap.set(art, {
        position: 'fixed', left: destination.left, top: destination.top,
        width: destination.width, height: destination.height,
        zIndex: 10, pointerEvents: 'none', transformOrigin: 'center center',
        x, y, scale: introScale,
      });
      timeline = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: showPage });
      timeline.to(art, { x: 0, y: 0, scale: 1, duration: 1.05, ease: 'power3.inOut' }, .45)
        .set(visual, { autoAlpha: 1 }, 1.5)
        .to('.nav', { autoAlpha: 1, duration: .5 }, 1.35)
        .to('.hero-copy', { autoAlpha: 1, duration: .6 }, 1.5)
        .to('.workspace', { autoAlpha: 1, duration: .65 }, 1.65)
        .to('footer', { autoAlpha: 1, duration: .5 }, 1.8);
    };
    window.addEventListener('resize', showPage, { once: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    if (art.complete) {
      if (art.naturalWidth) start();
      else showPage();
    } else {
      art.addEventListener('load', start, { once: true });
      art.addEventListener('error', showPage, { once: true });
    }
    return showPage;
  });
};
