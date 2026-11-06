import {Action, FileCard, FlowRail, Icon, Meter, NodeCard, Panel, Reveal, Tag, TerminalLine} from './graphics';
import {move, type BeatFrame} from './motion';
import {localize, type Clip, type Localized} from './story';

export type Shot = Pick<Clip, 'language' | 'variant'> & BeatFrame;

export function Offline({variant, language, beat, frame}: Shot) {
  const boost = variant === 'boost';
  const t = (zh: string, en: string) => localize(language, [zh, en]);
  const sources: [string, string, Localized][] = [
    ['Docker Engine', 'download.docker.com', ['静态二进制', 'Static binaries']],
    ['Docker Compose', 'github.com/docker/compose', ['独立发行页', 'Separate release']],
  ];

  if (beat === 0) return boost ? <div className="stage-row">
    <Panel title={t('DockerBoost / 离线安装', 'DockerBoost / Offline install')} icon="bolt">
      <div className="form-row"><label>{t('目标架构', 'Target architecture')}</label><Tag accent>x86_64</Tag></div>
      <div className="form-row"><label>{t('Docker 版本', 'Docker version')}</label><Tag accent>28.5.1</Tag></div>
      <div className="form-row"><label>Compose</label><Tag>{t('适用的最新版', 'Latest matching build')}</Tag></div>
      <div className="panel-action"><Action icon="download" click={{frame, at: 33}}>{t('下载离线包', 'Download bundle')}</Action></div>
    </Panel>
    <div className="side-mark"><Icon name="chip" size={52}/><b>x86_64</b><small>{t('内网目标机', 'Offline target')}</small></div>
  </div> : <div className="release-stack">
    {sources.map(([name, url, label], i) => <div className="release" key={name} style={{
      transform: `translate(${i * (166 + 24 * move(frame, 2, 18))}px, ${i * 71}px) rotate(${i === 0 ? -3 : 3}deg)`,
    }}>
      <div className="release-header"><Icon name="globe" size={19}/>{url}</div>
      <strong>{name}</strong><Tag>{localize(language, label)}</Tag>
    </div>)}
    <div className="search-badge" style={{transform: `translateX(${move(frame, 5, 30) * 61}px)`}}><Icon name="search" size={37}/></div>
  </div>;

  if (beat === 1) {
    const packing = move(frame, 8, 33);
    return boost ? <div className="stage-row pack-shot">
      <div className="bundle-list">
        {['Docker Engine', 'Docker Compose', 'SHA256SUMS', 'install_docker.sh'].map((name, i) =>
          <div key={name} style={{transform: `translateX(${move(frame, 8 + i * 4, 25 + i * 4) * 13}px)`}}>
            <Icon name={i === 3 ? 'terminal' : 'file'} size={20}/><code>{name}</code>
          </div>)}
      </div>
      <FlowRail frame={frame} at={5} label={t('组装离线包', 'Bundle files')} icon="box"/>
      <div className="artifact">
        <div className="artifact-emblem" style={{transform: `scale(${.86 + .14 * packing})`}}><Icon name="box" size={81}/></div>
        <b>docker-offline-*.tar</b><Meter progress={packing}/>
      </div>
    </div> : <Panel title={t('下载目录 / 手动比对', 'Downloads / Compare builds')} icon="search" width={526}>
      {['docker-28.5.1.tgz', 'docker-compose-linux-x86_64', 'docker-compose-linux-aarch64'].map((name, i) =>
        <div className={frame > 15 + 7 * i && i < 2 ? 'compare-row selected' : 'compare-row'} key={name}>
          <Icon name="file" size={20}/><code>{name}</code><Tag accent={i < 2 && frame > 15 + 7 * i}>{i < 2 ? 'x86_64' : 'aarch64'}</Tag>
        </div>)}
    </Panel>;
  }

  return <div className={`stage-row install-shot ${boost ? '' : 'manual-install'}`}>
    <FileCard label={boost ? 'docker-offline-*.tar' : t('两份发行文件', 'Two binaries')}
      detail={t('联网准备', 'Prepared online')} icon={boost ? 'box' : 'file'} ready/>
    <FlowRail frame={frame} at={2} label={t('拷贝到内网', 'Carry over')} icon="box"/>
    <Panel title={t('内网 Linux', 'Offline Linux')} icon="lock" width={boost ? 334 : 416}>
      {boost ? <>
        <TerminalLine>tar -xf docker-offline-*.tar</TerminalLine>
        <Reveal frame={frame} at={8}><TerminalLine>cd docker-offline-*/</TerminalLine></Reveal>
        <Reveal frame={frame} at={15}><TerminalLine>sudo sh install_docker.sh</TerminalLine></Reveal>
        <Reveal frame={frame} at={29}><Tag accent><Icon name="check" size={17}/>Docker + Compose</Tag></Reveal>
      </> : <>
        <TerminalLine>sudo cp docker/* /usr/local/bin/</TerminalLine>
        <Reveal frame={frame} at={7}>
          <TerminalLine>sudo install -D docker-compose {'\\'}</TerminalLine>
          <TerminalLine continuation>/usr/local/lib/docker/cli-plugins/docker-compose</TerminalLine>
        </Reveal>
        <Reveal frame={frame} at={15}><TerminalLine>sudo cp docker.service /etc/systemd/system/</TerminalLine></Reveal>
        <Reveal frame={frame} at={23}><TerminalLine>sudo systemctl enable --now docker</TerminalLine></Reveal>
      </>}
    </Panel>
  </div>;
}

export function Browser({variant, language, beat, frame}: Shot) {
  const boost = variant === 'boost';
  const t = (zh: string, en: string) => localize(language, [zh, en]);
  if (beat === 0) return <div className="stage-row">
    {boost ? <Panel title={t('DockerBoost / 下载镜像', 'DockerBoost / Download image')} icon="globe">
      <div className="form-row"><label>{t('公开镜像', 'Public image')}</label><Tag accent>nginx:latest</Tag></div>
      <div className="form-row"><label>{t('架构', 'Platform')}</label><Tag accent>linux/amd64</Tag></div>
      <div className="panel-action"><Action icon="download" click={{frame, at: 31}}>{t('浏览器下载', 'Browser download')}</Action></div>
    </Panel> : <Panel title={t('联网机器 / 终端', 'Connected host / Terminal')} icon="terminal" width={489}>
      <Tag><Icon name="stack" size={17}/>Docker Engine</Tag>
      <div className="pull-command">
        <TerminalLine>docker pull --platform linux/amd64 nginx:latest</TerminalLine>
        <TerminalLine muted>Pulling nginx:latest</TerminalLine>
        <Reveal frame={frame} at={16}><Meter progress={move(frame, 16, 41)}/></Reveal>
      </div>
    </Panel>}
    <div className="side-mark"><Icon name={boost ? 'globe' : 'stack'} size={52}/>
      <b>{boost ? t('浏览器', 'Browser') : 'Docker'}</b>
      <small>{boost ? t('无需 Docker', 'No Docker needed') : t('本地守护进程', 'Local daemon')}</small></div>
  </div>;

  if (beat === 1) return boost ? <div className="stage-row layers-shot">
    <div className="layer-pile">
      <svg width="175" height="138" viewBox="0 0 175 138" fill="none">
        {[2, 1, 0].map(i => {
          const p = move(frame, i * 5, 21 + i * 5);
          return <g key={i} transform={`translate(0 ${43 + i * 21 - p * 19})`} opacity={.37 + .63 * p}>
            <path d="M12 22 87 0l75 22v10L87 55 12 32Z" fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="2"/>
            <path d="m12 22 75 23 75-23M87 45v10" stroke="var(--accent)" strokeWidth="2"/>
            <circle cx="140" cy="33" r="2.2" fill="var(--accent)"/>
          </g>;
        })}
      </svg>
      <strong>{t('已校验的镜像层', 'Verified layers')}</strong>
    </div>
    <FlowRail frame={frame} at={13} label={t('本地打包', 'Pack locally')} icon="layers"/>
    <FileCard label="nginx_*.tar" detail="linux/amd64" icon="box" ready={frame > 29}/>
  </div> : <div className="stage-row">
    <Panel title={t('本地镜像库', 'Local image store')} icon="stack" width={505}>
      <div className="form-row"><code>nginx:latest</code><Tag accent>linux/amd64</Tag></div>
      <Reveal frame={frame} at={7}><TerminalLine>docker save -o nginx.tar nginx:latest</TerminalLine></Reveal>
      <Reveal frame={frame} at={20}><Meter progress={move(frame, 20, 37)}/></Reveal>
    </Panel>
    <Reveal frame={frame} at={23}><FileCard label="nginx.tar" detail="Docker TAR" icon="box" ready/></Reveal>
  </div>;

  const file = boost ? 'nginx_latest_linux_amd64.tar' : 'nginx.tar';
  return <div className="stage-row import-shot">
    <NodeCard icon="box" title={t('镜像归档', 'Image archive')}><Tag>linux/amd64</Tag></NodeCard>
    <FlowRail frame={frame} at={0} label={t('转移 TAR', 'Transfer TAR')} icon="box"/>
    <Panel title={t('目标机器 / Docker', 'Target machine / Docker')} icon="terminal" width={392}>
      <TerminalLine>docker load -i {file}</TerminalLine>
      <Reveal frame={frame} at={21}><TerminalLine muted>Loaded image: nginx:latest</TerminalLine></Reveal>
      <Reveal frame={frame} at={28}><Tag accent><Icon name="check" size={17}/>{t('镜像已导入', 'Image imported')}</Tag></Reveal>
    </Panel>
  </div>;
}
