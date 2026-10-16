// Public defaults shared by the page build and Worker. Do not put secrets here.
export const config = {
  site: {
    author: 'COOLCAT',
    links: {
      githubRepository: 'https://github.com/coolcat327/dockerboost',
      onlineInstallScript: 'https://linuxmirrors.cn/docker.sh',
      onlineInstallGuide: 'https://linuxmirrors.cn/#docker',
      dockerBinaries: 'https://download.docker.com/linux/static/stable/',
      composeReleases: 'https://github.com/docker/compose/releases',
      dockerBinariesGuide: 'https://docs.docker.com/engine/install/binaries/',
      composeGuide: 'https://docs.docker.com/compose/install/linux/',
    },
  },
  imageSources: [
    {
      "id": "mirror-gcr",
      "label": "mirror.gcr.io",
      "url": "https://mirror.gcr.io",
      "naming": "docker-hub",
      "requiresNamespace": false,
      "example": "nginx:latest"
    },
    {
      "id": "ghcr",
      "label": "ghcr.io",
      "url": "https://ghcr.io",
      "naming": "native",
      "requiresNamespace": true,
      "example": "owner/image:tag"
    },
    {
      "id": "quay",
      "label": "quay.io",
      "url": "https://quay.io",
      "naming": "native",
      "requiresNamespace": true,
      "example": "org/image:tag"
    },
    {
      "id": "k8s",
      "label": "registry.k8s.io",
      "url": "https://registry.k8s.io",
      "naming": "native",
      "requiresNamespace": false,
      "example": "pause:3.10"
    },
    {
      "id": "gitlab",
      "label": "registry.gitlab.com",
      "url": "https://registry.gitlab.com",
      "naming": "native",
      "requiresNamespace": true,
      "example": "group/project/image:tag"
    },
    {
      "id": "mcr",
      "label": "mcr.microsoft.com",
      "url": "https://mcr.microsoft.com",
      "naming": "native",
      "requiresNamespace": true,
      "example": "dotnet/aspnet:8.0"
    },
    {
      "id": "ecr-public",
      "label": "public.ecr.aws",
      "url": "https://public.ecr.aws",
      "naming": "native",
      "requiresNamespace": true,
      "example": "namespace/image:tag"
    }
  ]
};
