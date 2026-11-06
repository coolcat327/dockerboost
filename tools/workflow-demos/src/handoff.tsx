import type {ReactNode} from 'react';
import {Action, FileCard, Icon, Meter, Panel, Reveal, Tag, TerminalLine} from './graphics';
import {ease, linear, type BeatFrame} from './motion';
import type {Shot} from './offline';
import {localize} from './story';

const sharedImages = [
  {image: 'nginx:1.28', platform: 'linux/amd64', file: 'nginx-1.28.tar'},
  {image: 'redis:7.4', platform: 'linux/arm64', file: 'redis-7.4.tar'},
];

type Steps = {
  current: BeatFrame;
  previous?: BeatFrame;
  mix: number;
};

function HandoffSteps({current, previous, mix, children}: Steps & {children: (step: BeatFrame) => ReactNode}) {
  const outgoing = previous && mix < .5;
  return <div className="handoff-steps" style={{
    opacity: Math.abs(2 * mix - 1),
    translate: `0 ${outgoing ? -10 * mix : 10 * (1 - mix)}px`,
  }}>
    {children(outgoing ? previous : current)}
  </div>;
}

export function Share({variant, language, ...steps}: Pick<Shot, 'variant' | 'language'> & Steps) {
  const boost = variant === 'boost';
  const t = (zh: string, en: string) => localize(language, [zh, en]);
  const token = boost ? 'link' : 'box';
  const {current, previous, mix} = steps;
  const rail = previous && mix < .5 ? previous : current;
  const travel = rail.beat === 0 ? 0 : rail.beat === 1 ? ease(rail.frame - 3, 36) : 1;
  const resetOpacity = previous?.beat === 2 && current.beat === 0 ? Math.abs(2 * mix - 1) : 1;

  return <div className="stage-row share-shot">
    <Panel title={t('发送方', 'Sender')} icon="stack" width={255}>
      <HandoffSteps {...steps}>{({beat, frame}) => <>
        {sharedImages.map(({image, platform, file}, i) => <div className="handoff-item" key={image}>
          <div className="handoff-ref">
            <code>{!boost && beat > 0 ? file : image}</code>
            {boost && <Tag>{platform}</Tag>}
            {!boost && beat > 0 && <Icon name="check" size={16}/>}
          </div>
          {!boost && beat === 0 && <Meter progress={linear(frame, 3 + i * 12, 27 + i * 12)}/>}
        </div>)}
        <div className="handoff-status">{boost && beat === 0
          ? <Action icon="copy" click={{frame, at: 35}}>{t('复制分享链接', 'Copy share link')}</Action>
          : <Tag accent={boost || beat > 0}>{boost ? t('发送方无需下载', 'No sender download')
            : beat === 0 ? 'docker pull → docker save' : t('两份 TAR 已导出', 'Two TARs exported')}</Tag>}
        </div>
      </>}</HandoffSteps>
    </Panel>
    <div className="handoff-path">
      <strong>{boost ? t('1 条链接', '1 link') : t('2 份 TAR', '2 TAR files')}</strong>
      <div className="handoff-track" style={{opacity: resetOpacity}}>
        <i style={{width: `${travel * 100}%`}}/>
        <span style={{left: `${8 + 84 * travel}%`}}><Icon name={token} size={22}/></span>
      </div>
      <HandoffSteps {...steps}>{({beat}) => <small>{beat === 0 ? t('准备分享', 'Preparing')
        : beat === 1 ? boost ? t('转发链接', 'Share link') : t('上传镜像文件', 'Upload archives')
        : t('已送达', 'Delivered')}</small>}</HandoffSteps>
    </div>
    <Panel title={t('队友', 'Teammate')} icon="download" width={255}>
      <HandoffSteps {...steps}>{({beat, frame}) => {
        if (beat < 2) {
          const received = beat === 1 ? ease(frame - 30, 13) : 0;
          const arrived = received >= .5;
          const status = boost
            ? arrived ? t('打开分享链接', 'Open share link') : t('等待链接', 'Waiting for link')
            : arrived ? t('收到两份附件', 'Two files received') : t('等待文件', 'Waiting for files');
          return <div className="handoff-wait">
            <div className={arrived ? 'handoff-notice received' : 'handoff-notice'}>
              <Icon name={token} size={33}/>
              <span style={{opacity: Math.abs(2 * received - 1)}}>{status}</span>
            </div>
          </div>;
        }

        return <>
          {sharedImages.map(({image, platform, file}, i) => <div className="handoff-item" key={image}>
            <div className="handoff-ref">
              <code>{boost ? image : file}</code>
              {boost && <Tag accent>{platform}</Tag>}
              {!boost && frame >= 33 + i * 6 && <Icon name="check" size={16}/>}
            </div>
            {!boost && <Meter progress={linear(frame, 10 + i * 6, 33 + i * 6)}/>}
          </div>)}
          <div className="handoff-status">
            {boost ? frame < 39
              ? <Action icon="download" click={{frame, at: 26}}>{t('开始下载', 'Start download')}</Action>
              : <Tag accent><Icon name="download" size={16}/>{t('队友开始下载', 'Download started')}</Tag>
              : <Tag accent={frame >= 39}>{frame >= 39 ? t('已下载 · docker load', 'Ready for docker load') : t('队友下载 TAR', 'Downloading TARs')}</Tag>}
          </div>
        </>;
      }}</HandoffSteps>
    </Panel>
  </div>;
}

const batchImages = ['nginx:1.28', 'redis:7.4', 'postgres:17'];

export function Batch({variant, language, beat, frame}: Shot) {
  const boost = variant === 'boost';
  const t = (zh: string, en: string) => localize(language, [zh, en]);
  if (beat === 0) return <div className="stage-row batch-input">
    <Panel title="compose.yaml" icon="file" width={312}>
      <div className="yaml"><code>services:</code>{batchImages.map((image, i) => <code key={image}
        className={frame >= 4 + i * 8 ? 'lit' : ''}><span>{['web', 'cache', 'db'][i]}:</span> {'{'}image: {image}{'}'}</code>)}</div>
    </Panel>
    <Icon name="arrow" size={33}/>
    <Panel title={boost ? t('下载队列', 'Download queue') : t('手工清单', 'Manual checklist')} icon={boost ? 'layers' : 'copy'} width={294}>
      {batchImages.map(image => <div className="tiny-row" key={image}><code>{image}</code>
        <Icon name="check" size={17}/>
      </div>)}
      <div className="panel-action"><Action icon={boost ? 'copy' : 'terminal'} click={boost ? {frame, at: 34} : undefined}>
        {boost ? t('复制终端命令', 'Copy terminal command') : t('逐项写命令', 'Write commands')}
      </Action></div>
    </Panel>
  </div>;

  const activeImage = Math.min(batchImages.length - 1, Math.floor(frame / 17));
  const [repository] = batchImages[activeImage].split(':');

  if (beat === 1) return <Panel title={boost ? t('终端 / 批量下载', 'Terminal / Batch download') : t('终端 / Docker 主机', 'Terminal / Docker host')} icon="terminal" width={578}>
    <div className="shell-meta"><Tag accent={boost}>{boost ? 'sh · curl · jq · tar' : 'Docker Engine'}</Tag><Tag>linux/amd64</Tag></div>
    {boost ? batchImages.map((image, i) => {
      const p = linear(frame, i * 3, 36 + i * 3);
      return <div className="batch-progress" key={image}><code>{image}</code><Meter progress={p}/>
        <code>{Math.round(p * 100)}%</code></div>;
    }) : <>
      <div className="shell-highlight"><TerminalLine>docker pull --platform linux/amd64 {batchImages[activeImage]}</TerminalLine></div>
      <div className="shell-highlight"><TerminalLine>docker save -o {repository}.tar {batchImages[activeImage]}</TerminalLine></div>
      <div className="shell-sequence">{batchImages.map((image, i) => <Tag key={image} accent={i === activeImage}>
        {i < activeImage && <Icon name="check" size={15}/>}<code>{image}</code>
      </Tag>)}</div>
    </>}
  </Panel>;

  return <div className="batch-artifacts">
    <div className="tray-head"><Icon name="stack" size={22}/>{t('本地归档', 'Local archives')}<Tag accent={boost}>linux/amd64</Tag></div>
    <div className="tray-files">
      {batchImages.map((image, i) => {
        const [name, version] = image.split(':');
        return <Reveal key={image} frame={frame} at={boost ? i * 3 : i * 6}>
          <FileCard icon="box" label={boost ? `${name}_${version}_*.tar` : `${name}.tar`}
            detail={boost ? image : t('手动导出', 'Manual export')} ready/>
        </Reveal>;
      })}
    </div>
  </div>;
}
