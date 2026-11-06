export type Language = 'zh' | 'en';
export type Variant = 'traditional' | 'boost';
export type Localized = readonly [zh: string, en: string];
type Caption = readonly [title: Localized, detail: Localized];
type Story = {
  number: string;
  name: Localized;
  traditional: readonly [Caption, Caption, Caption];
  boost: readonly [Caption, Caption, Caption];
};

const importArchive: Caption = [
  ['把 TAR 带到内网导入', 'Load the TAR on the target'],
  ['在内网机器运行 docker load，镜像即可使用', 'Run docker load on the offline Docker host'],
];

export const stories = {
  offline: {
    number: '01', name: ['离线安装', 'OFFLINE INSTALL'],
    traditional: [
      [['跑两个发行页找文件', 'Hunt through two release pages'], ['Docker Engine 和 Compose 分开发布，得各下载一份', 'Download Docker Engine and Compose from separate releases']],
      [['两份文件都得核对架构', 'Check both builds by hand'], ['对照内网机器的架构，逐一确认二进制选对了', 'Check each binary against the offline machine’s architecture']],
      [['复制二进制，手配服务', 'Copy binaries and set up systemd'], ['放好 Docker 和 Compose，再复制服务文件并启动', 'Place Docker and Compose, then copy the service file and start Docker']],
    ],
    boost: [
      [['选好架构和 Docker 版本', 'Pick a platform and Docker version'], ['DockerBoost 找出适用的最新版 Compose 文件', 'DockerBoost finds the matching build of the latest Compose release']],
      [['所需文件打成一包', 'Get one offline bundle'], ['Docker、Compose、校验文件和安装脚本一起下载', 'Download Docker, Compose, checksums, and the installer together']],
      [['解包，运行安装脚本', 'Unpack and run the installer'], ['在内网按包内说明安装 Docker 和 Compose', 'Follow the bundled instructions to install Docker and Compose offline']],
    ],
  },
  browser: {
    number: '02', name: ['镜像带到内网', 'OFFLINE IMAGE TRANSFER'],
    traditional: [
      [['先找一台联网的 Docker 主机', 'Find a connected Docker host'], ['下载端也得有 Docker，才能拉取目标架构的镜像', 'The download machine needs Docker just to pull the target image']],
      [['拉取后再执行 docker save', 'Pull first, then run docker save'], ['镜像先进本地镜像库，再额外导出一份 TAR', 'Keep the image in the local store and export a separate TAR']],
      importArchive,
    ],
    boost: [
      [['浏览器里直接选镜像', 'Choose the image in your browser'], ['选公开镜像和架构，下载机器无需装 Docker', 'Pick a public image and platform on a machine without Docker']],
      [['浏览器直接生成 TAR', 'Build the TAR in the browser'], ['下载并校验镜像层，在本机组装成 TAR', 'Download and verify the layers, then build the TAR locally']],
      importArchive,
    ],
  },
  share: {
    number: '03', name: ['团队分享', 'TEAM HANDOFF'],
    traditional: [
      [['发文件前，自己先下载', 'Download before you can share'], ['发送方先拉取镜像，再分别导出 TAR', 'The sender pulls the images and saves them as TAR files']],
      [['上传整份镜像归档', 'Upload the full TAR files'], ['发送方上传两份 TAR，把文件转给队友', 'The sender uploads both archives so the teammate can get them']],
      [['队友还要下载一遍', 'The teammate downloads again'], ['队友下载两份 TAR，保存到本地再导入', 'The teammate downloads both TARs before importing them']],
    ],
    boost: [
      [['选好镜像，直接复制链接', 'Choose images and copy the link'], ['发送方从队列生成链接，省去分享前的下载', 'The sender can share the queue without downloading the images first']],
      [['发一条链接就够了', 'Send one link'], ['链接带上镜像名、版本标签和架构，省去手抄核对', 'The link carries image names, tags, and platforms together']],
      [['队友需要时再下载', 'Download when needed'], ['打开链接恢复队列，由队友确认后开始下载', 'The link restores the queue. The teammate starts the download']],
    ],
  },
  batch: {
    number: '04', name: ['Compose 批量归档', 'COMPOSE BATCH EXPORT'],
    traditional: [
      [['手动抄出每个镜像', 'Copy each image reference'], ['从 Compose 逐项找出镜像，准备目标架构的命令', 'Find each image in Compose and prepare its platform-specific command']],
      [['每个镜像都跑一遍命令', 'Repeat pull and save for every image'], ['在联网 Docker 主机上切换镜像名，反复拉取和导出', 'On a connected Docker host, change the image name and repeat the commands']],
      [['逐份检查导出的 TAR', 'Check each export by hand'], ['核对归档和服务是否一一对应', 'Make sure each TAR matches the intended service']],
    ],
    boost: [
      [['导入 Compose，复制一条命令', 'Import Compose and copy one command'], ['自动提取镜像，选好架构后复制批量命令', 'Build the queue from Compose and copy one command for the chosen platform']],
      [['一条命令并发下载', 'Download in parallel from the terminal'], ['联网机器有常用 shell 工具即可，无需 Docker', 'Run the batch with common shell tools on a machine without Docker']],
      [['每个镜像生成一份 TAR', 'Get one TAR per image'], ['独立归档存到本地，可以按需分开转移', 'The archives are saved locally and can be transferred separately']],
    ],
  },
} satisfies Record<string, Story>;

export type Scene = keyof typeof stories;
export type Clip = {scene: Scene; variant: Variant; language: Language};
export const localize = (language: Language, [zh, en]: Localized) => language === 'zh' ? zh : en;
