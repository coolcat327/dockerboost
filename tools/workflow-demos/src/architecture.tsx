import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {Icon} from './graphics';
import {ease, linear} from './motion';
import {localize, type Language} from './story';

export const ARCHITECTURE_DURATION = 400;
export const ARCHITECTURE_WIDTH = 960;
export const ARCHITECTURE_HEIGHT = 600;

type Point = [number, number];

// Packets follow the same fixed routes as the architecture's arrows.
function Route({points, frame, start, end, response = false, archive = false}: {
  points: Point[]; frame: number; start: number; end: number; response?: boolean; archive?: boolean;
}) {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const active = ease(frame - start, 8) * (1 - ease(frame - end, 8));
  return <g className={response ? 'map-route response' : 'map-route'}>
    <polyline points={points.map(point => point.join(',')).join(' ')} markerEnd={`url(#arrow-${response ? 'response' : 'request'})`} style={{opacity: .25 + .65 * active}}/>
    <g opacity={active}>{(archive ? [0] : [0, .5]).map(offset => {
      let distance = archive ? linear(frame, start + 6, end - 3) * total
        : (((frame - start) * 2.2 / total + offset) % 1 + 1) % 1 * total;
      let segment = 0;
      while (segment < lengths.length - 1 && distance > lengths[segment]) distance -= lengths[segment++];
      const mix = distance / lengths[segment];
      const from = points[segment];
      const to = points[segment + 1];
      const x = from[0] + (to[0] - from[0]) * mix;
      const y = from[1] + (to[1] - from[1]) * mix;
      return archive ? <g key={offset} transform={`translate(${x} ${y})`}>
        <rect x="-20" y="-11" width="40" height="22" rx="6" className="map-parcel"/>
        <text y="4" textAnchor="middle" className="map-mono data-label">TAR</text>
      </g> : <g key={offset}><circle r="7" cx={x} cy={y} opacity=".12"/><circle r={response ? 3.5 : 3} cx={x} cy={y}/></g>;
    })}</g>
  </g>;
}

function Highlight({x, y, width, height, amount, data = false}: {
  x: number; y: number; width: number; height: number; amount: number; data?: boolean;
}) {
  return <rect x={x} y={y} width={width} height={height} rx="12" opacity={amount}
    className={data ? 'map-highlight data-highlight' : 'map-highlight'}/>;
}

export function Architecture({language}: {language: Language}) {
  const frame = useCurrentFrame();
  const t = (zh: string, en: string) => localize(language, [zh, en]);
  const reset = 1 - ease(frame - 382, 17);
  const received = linear(frame, 174, 270) * reset;
  const packed = ease(frame - 275, 25) * reset;
  const imported = ease(frame - 353, 18) * reset;
  const tap = ease(frame - 72, 8) * (1 - ease(frame - 96, 10));
  const active = (start: number, end: number) => ease(frame - start, 10) * (1 - ease(frame - end, 10));

  const statuses = [
    {at: 0, label: t('打开工具页面', 'Open the toolkit')},
    {at: 80, label: t('请求镜像与平台', 'Request image & platform')},
    {at: 150, label: t('镜像数据流式返回', 'Stream image data')},
    {at: 270, label: t('在下载端组装 TAR', 'Build TAR on the client')},
    {at: 310, label: t('保存并拷贝归档', 'Save & copy the archive')},
    {at: 350, label: t('在目标机导入镜像', 'Import on the target host')},
  ];
  const status = [...statuses].reverse().find(item => frame >= item.at)!;
  const statusOpacity = frame >= 390 ? ease(frame - 390, 9)
    : frame >= 382 ? 1 - ease(frame - 382, 8)
      : status.at === 0 ? 1 : ease(frame - status.at, 8);

  return <AbsoluteFill className="clip boost architecture" lang={language === 'zh' ? 'zh-CN' : 'en'}>
    <header className="masthead">
      <div className="brand"><span><Icon name="bolt" size={21}/></span>DockerBoost</div>
      <div className="case">{t('系统架构与下载数据流', 'System architecture & download flow')}</div>
    </header>
    <div className="stage architecture-stage">
      <svg width="100%" height="100%" viewBox="0 0 912 426" className="architecture-map">
        <defs>{['request', 'response'].map(kind => <marker key={kind} id={`arrow-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 8 4 0 8" fill="none" stroke={kind === 'response' ? 'var(--flow-data)' : 'var(--accent)'} strokeWidth="1.5"/>
        </marker>)}</defs>

        <rect x="130" y="20" width="272" height="386" rx="17" className="map-boundary"/>
        <text x="266" y="44" className="map-label" textAnchor="middle">{t('下载端 · 无需安装 Docker', 'Download client · No Docker needed')}</text>
        <g className="map-user">
          <circle cx="58" cy="112" r="15"/>
          <path d="M31 159v-8a27 27 0 0 1 54 0v8"/>
          <text x="58" y="185" textAnchor="middle" className="map-title">{t('用户', 'User')}</text>
          <text x="58" y="206" textAnchor="middle" className="map-small">{t('选择并下载', 'Select & download')}</text>
        </g>
        <Route points={[[88, 139], [149, 139]]} frame={frame} start={10} end={48}/>
        <rect x="150" y="65" width="232" height="181" rx="12" className="map-card"/>
        <Highlight x={150} y={65} width={232} height={181} amount={active(40, 108)}/>
        <text x="168" y="90" className="map-title">{t('DockerBoost 页面', 'DockerBoost page')}</text>
        <path d="M150 102H382" className="map-divider"/>
        <text x="168" y="124" className="map-small">{t('安装 · 加速 · 拉取 · 离线归档', 'Install · Mirrors · Pull · Archive')}</text>
        <rect x="166" y="139" width="200" height="30" rx="6" className="map-inset"/>
        <text x="266" y="159" textAnchor="middle" className="map-mono">nginx:latest · linux/amd64</text>
        <rect x="166" y="182" width="96" height="28" rx="6" className="map-button"/>
        <rect x="270" y="182" width="96" height="28" rx="6" className="map-button"/>
        <text x="214" y="201" textAnchor="middle" className="map-label">{t('浏览器下载', 'Browser')}</text>
        <text x="318" y="201" textAnchor="middle" className="map-label">{t('复制命令', 'Copy command')}</text>
        <text x="266" y="231" textAnchor="middle" className="map-small">{t('在浏览器或终端下载', 'Download in a browser or terminal')}</text>
        <g opacity={tap} transform={`translate(${328 + 12 * (1 - ease(frame - 72, 8))} ${194 - 12 * (1 - ease(frame - 72, 8))})`}>
          <circle r={6 + 20 * linear(frame, 80, 96)} opacity={1 - linear(frame, 80, 96)} fill="none" stroke="var(--accent)"/>
          <path d="M0 0v22l6-6 5 10 5-3-5-9h10Z" fill="white" stroke="var(--bg)"/>
        </g>

        <rect x="470" y="20" width="230" height="253" rx="17" className="map-boundary edge-boundary"/>
        <text x="585" y="45" className="map-title" textAnchor="middle">{t('边缘服务 · 任选其一部署', 'Edge service · Deploy to either')}</text>
        <text x="585" y="67" className="map-small" textAnchor="middle">Cloudflare Workers / EdgeOne Pages</text>
        <rect x="488" y="86" width="194" height="48" rx="9" className="map-card"/>
        <Highlight x={488} y={86} width={194} height={48} amount={active(35, 76)}/>
        <text x="585" y="106" className="map-label" textAnchor="middle">{t('静态页面与资源', 'Static page & assets')}</text>
        <text x="585" y="123" className="map-small" textAnchor="middle">Assets / Pages</text>
        <rect x="488" y="158" width="194" height="95" rx="9" className="map-card"/>
        <Highlight x={488} y={158} width={194} height={95} amount={Math.max(active(88, 160), active(164, 264))} data={frame >= 150}/>
        <text x="585" y="181" className="map-title" textAnchor="middle">{t('镜像 API', 'Image API')}</text>
        <text x="585" y="205" className="map-small" textAnchor="middle">{t('共用 Hono 应用 · 元数据解析', 'Hono · Resolve metadata')}</text>
        <text x="585" y="233" className="map-label data-label" textAnchor="middle">{t('配置与镜像层流式转发', 'Stream config & image layers')}</text>

        <rect x="774" y="138" width="122" height="115" rx="12" className="map-card"/>
        <Highlight x={774} y={138} width={122} height={115} amount={active(110, 250)} data={frame >= 150}/>
        <text x="835" y="164" className="map-title" textAnchor="middle">Registry</text>
        <text x="835" y="186" className="map-small" textAnchor="middle">{t('上游 / 镜像源', 'Upstream / Mirror')}</text>
        <text x="835" y="214" className="map-small" textAnchor="middle">{t('清单与配置', 'Manifest & config')}</text>
        <text x="835" y="235" className="map-small" textAnchor="middle">{t('镜像层 blobs', 'Layer blobs')}</text>

        <Route points={[[488, 110], [383, 110]]} frame={frame} start={40} end={75}/>
        <text x="435" y="99" className="map-small" textAnchor="middle">{t('打开页面', 'Load page')}</text>
        <Route points={[[382, 177], [487, 177]]} frame={frame} start={80} end={148}/>
        <text x="435" y="166" className="map-small" textAnchor="middle">{t('镜像 / 平台', 'Image / platform')}</text>
        <Route points={[[682, 177], [773, 177]]} frame={frame} start={100} end={158}/>
        <text x="728" y="166" className="map-small" textAnchor="middle">{t('请求', 'Request')}</text>
        <Route points={[[774, 227], [683, 227]]} frame={frame} start={150} end={248} response/>
        <Route points={[[488, 227], [383, 227]]} frame={frame} start={163} end={264} response/>
        <text x="435" y="217" className="map-small data-label" textAnchor="middle">{t('数据流', 'Data stream')}</text>
        <Route points={[[266, 246], [266, 286]]} frame={frame} start={174} end={270} response/>

        <rect x="150" y="287" width="232" height="108" rx="12" className="map-card"/>
        <Highlight x={150} y={287} width={232} height={108} amount={active(175, 309)} data/>
        <text x="266" y="310" className="map-title" textAnchor="middle">{t('本地暂存与归档', 'Local storage & archive')}</text>
        <text x="167" y="332" className="map-small">{t('镜像数据', 'Image data')}</text>
        <text x="167" y="353" className="map-small">{t('本地打包', 'Build TAR')}</text>
        <rect x="235" y="326" width="130" height="5" rx="2" className="map-progress-track"/>
        <rect x="235" y="326" width={130 * received} height="5" rx="2" className="map-progress-data"/>
        <rect x="235" y="347" width="130" height="5" rx="2" className="map-progress-track"/>
        <rect x="235" y="347" width={130 * packed} height="5" rx="2" className="map-progress-data"/>
        <rect x="207" y="365" width="118" height="23" rx="6" className="map-inset" opacity={packed}/>
        <text x="266" y="381" className="map-mono data-label" textAnchor="middle" opacity={.25 + .75 * packed}>nginx.tar <tspan opacity={ease(frame - 300, 8) * reset}>✓</tspan></text>
        <Route points={[[382, 375], [654, 375]]} frame={frame} start={312} end={348} response archive/>
        <text x="518" y="354" className="map-small" textAnchor="middle">{t('用户保存并拷贝归档', 'User saves & copies the archive')}</text>
        <rect x="656" y="324" width="240" height="81" rx="12" className="map-card"/>
        <Highlight x={656} y={324} width={240} height={81} amount={active(337, 378)} data/>
        <text x="776" y="347" className="map-title" textAnchor="middle">{t('目标机 / 内网', 'Target host / Private network')}</text>
        <text x="776" y="372" className="map-mono" textAnchor="middle">docker load -i nginx.tar</text>
        <text x="776" y="393" className="map-small" textAnchor="middle">{t('已安装 Docker', 'Docker installed')}<tspan opacity={imported} className="data-label"> · ✓</tspan></text>

      </svg>
    </div>
    <footer className="caption">
      <div className="architecture-footer-row">
        <div className="architecture-legend"><span><i/>{t('操作与请求', 'Actions & requests')}</span><span className="data"><i/>{t('镜像数据与归档', 'Image data & archive')}</span></div>
        <div className="architecture-status" style={{opacity: statusOpacity}}><i/>{frame >= 390 ? statuses[0].label : status.label}</div>
      </div>
      <p>{t('边缘服务流式转发，下载端本地打包；用户将 TAR 拷贝到装有 Docker 的目标机导入。', 'The edge streams data. The client builds the TAR. The user copies it to a Docker host for import.')}</p>
    </footer>
  </AbsoluteFill>;
}
