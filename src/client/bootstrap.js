import { initHeroIntro } from './hero-intro.js';

// Let the illustration paint before the tool modules compete for the main thread.
initHeroIntro().then(() => import('./app.js'));
