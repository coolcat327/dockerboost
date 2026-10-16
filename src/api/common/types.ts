export interface Env {
  ASSETS: Fetcher;
  IMAGE_SOURCES?: string;
}

export type ApiEnv = { Bindings: Env };

export type RegistrySource = {
  id: string;
  label: string;
  url: string;
  naming: 'docker-hub' | 'native';
  requiresNamespace: boolean;
  example?: string;
};

export type Descriptor = { mediaType: string; digest: string; size: number; platform?: { os?: string; architecture?: string; variant?: string } };
export type Manifest = { schemaVersion: number; mediaType?: string; config?: Descriptor; layers?: Descriptor[]; manifests?: Descriptor[] };
export type ImageConfig = { os?: string; architecture?: string; variant?: string };
