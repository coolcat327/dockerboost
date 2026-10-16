import type { RegistrySource } from './src/api/common/types';

export const config: {
  site: { author: string; links: Record<string, string> };
  imageSources: RegistrySource[];
};
