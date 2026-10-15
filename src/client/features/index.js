import { feature as install } from './install/index.js';
import { feature as setup } from './setup/index.js';
import { feature as pull } from './pull/index.js';
import { feature as download } from './download/index.js';

// Register a new tab here after adding its button, panel, and feature module.
export const features = [install, setup, pull, download];
