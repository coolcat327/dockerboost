import { feature as install } from './install/index.js';
import { feature as setup } from './setup/index.js';
import { feature as pull } from './pull/index.js';
import { feature as download } from './download/index.js';
import { feature as convert } from './convert/index.js';
import { feature as manual } from './manual/index.js';

// Ship tool interfaces together; activation still owns initialization and requests.
export const features = [install, setup, pull, download, convert, manual];
