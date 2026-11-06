import { shellQuote } from '../../common/shell-quote.js';
import { localImageTag } from '../../../common/image-syntax.js';

export function pullCommand(image, platform) {
  const accelerated = shellQuote(image.accelerated);
  const pull = `docker pull --platform ${shellQuote(platform)} ${accelerated}`;
  const tag = localImageTag(image.original);
  return tag ? `${pull} &&\ndocker tag ${accelerated} ${shellQuote(tag)} &&\ndocker image rm ${accelerated}` : pull;
}
