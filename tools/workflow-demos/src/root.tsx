import {AbsoluteFill, Composition, Folder, useCurrentFrame} from 'remotion';
import {Icon, type IconName} from './graphics';
import {Architecture, ARCHITECTURE_DURATION, ARCHITECTURE_HEIGHT, ARCHITECTURE_WIDTH} from './architecture';
import {Batch, Share} from './handoff';
import {BEATS, CROSSFADE, DURATION, FPS, HEIGHT, LOOP_FADE, WIDTH, ease, linear, type BeatFrame} from './motion';
import {Browser, Offline} from './offline';
import {localize, stories, type Clip, type Language, type Scene, type Variant} from './story';
import './stage.css';
import './architecture.css';

const scenes = {offline: Offline, browser: Browser, batch: Batch};
const languages: Language[] = ['zh', 'en'];
const variants: Variant[] = ['traditional', 'boost'];
const opening: BeatFrame = {beat: 0, frame: 0};
const loopStart = DURATION - 1 - LOOP_FADE;

type Handoff = {icon: IconName; from: [number, number]; to: [number, number]};

const handoffs = {
  offline: [
    {icon: 'box', from: [53, 73], to: [77, 42]},
    {icon: 'box', from: [77, 42], to: [17, 42]},
  ],
  browser: [
    {icon: 'layers', from: [55, 68], to: [25, 43]},
    {icon: 'box', from: [77, 42], to: [17, 43]},
  ],
  batch: [
    {icon: 'terminal', from: [75, 70], to: [34, 38]},
    {icon: 'box', from: [44, 60], to: [62, 44]},
  ],
} satisfies Record<keyof typeof scenes, [Handoff, Handoff]>;

function HandoffToken({icon, from, to, mix}: Handoff & {mix: number}) {
  const lift = 4 * mix * (1 - mix);
  return <div className="transition-token" style={{
    left: `${from[0] + (to[0] - from[0]) * mix}%`,
    top: `calc(${from[1] + (to[1] - from[1]) * mix}% - ${28 * lift}px)`,
    opacity: Math.min(1, 6 * mix, 6 * (1 - mix)),
    transform: `translate(-50%, -50%) scale(${.76 + .24 * lift})`,
  }}><Icon name={icon} size={30}/></div>;
}

function SceneArt(props: Clip) {
  const frame = useCurrentFrame();
  const {scene, language, variant} = props;
  const story = stories[scene];
  const beat = frame >= BEATS[2] ? 2 : frame >= BEATS[1] ? 1 : 0;
  const frameInBeat = frame - BEATS[beat];
  const restart = ease(frame - loopStart, LOOP_FADE);
  const looping = restart > 0;
  const current: BeatFrame = looping ? opening : {beat, frame: frameInBeat};
  const previous: BeatFrame | undefined = looping
    ? {beat: 2, frame: loopStart - BEATS[2]}
    : beat > 0 && frameInBeat < CROSSFADE
      ? {beat: beat === 2 ? 1 : 0, frame: BEATS[beat] - BEATS[beat - 1] - 1}
      : undefined;
  const mix = looping ? restart : previous ? ease(frameInBeat, CROSSFADE - 1) : 1;
  const outgoing = previous && mix < .5;
  const visible = outgoing ? previous : current;
  const captionBeat = visible.beat;
  const [title, detail] = story[variant][captionBeat];
  const Shot = scene === 'share' ? null : scenes[scene];
  const handoff = scene !== 'share' && !looping && beat > 0 ? handoffs[scene][beat - 1] : undefined;
  const dissolving = previous && mix > 0 && mix < 1;
  const focus = Math.abs(mix * 2 - 1);
  const shotOpacity = linear(focus, .14, .85);

  return <AbsoluteFill className={`clip ${variant}`} lang={language === 'zh' ? 'zh-CN' : 'en'}>
    <header className="masthead">
      <div className="brand"><span><Icon name={variant === 'boost' ? 'bolt' : 'layers'} size={21}/></span>
        {variant === 'boost' ? 'DockerBoost' : localize(language, ['传统流程', 'Traditional workflow'])}
      </div>
      <div className="case"><b>{story.number}</b><span>{localize(language, story.name)}</span></div>
    </header>
    <div className={`stage ${scene}`}>
      <div className="stage-orbit orbit-left"/><div className="stage-orbit orbit-right"/>
      {Shot ? <>
        <div className="shot" style={dissolving ? {
          opacity: shotOpacity,
          translate: handoff && shotOpacity < 1 ? `0 ${(outgoing ? -8 : 8) * (1 - shotOpacity)}px` : undefined,
        } : undefined}>
          <Shot {...props} {...visible}/>
        </div>
        {dissolving && handoff && <HandoffToken {...handoff} mix={mix}
          icon={scene === 'offline' && variant === 'traditional' ? 'file' : handoff.icon}/>}
      </> : <div className="shot">
        <Share {...props} current={current} previous={previous} mix={mix}/>
      </div>}
    </div>
    <footer className="caption">
      <div className="caption-title" style={{opacity: focus}}>
        <div className="beat-index">0{captionBeat + 1}</div>
        <div>
          <h1>{localize(language, title)}</h1>
          <p>{localize(language, detail)}</p>
        </div>
      </div>
      <div className="timeline">{BEATS.map((start, i) => {
        const end = BEATS[i + 1] ?? DURATION;
        const progress = (1 - restart) * linear(frame, start, end - 1);
        return <div key={start}><i style={{width: `${progress * 100}%`}}/></div>;
      })}</div>
    </footer>
  </AbsoluteFill>;
}

export const Root = () => <><Folder name="architecture">{languages.map(language =>
  <Composition key={language} id={`architecture-boost-${language}`} component={Architecture}
    defaultProps={{language}} durationInFrames={ARCHITECTURE_DURATION} fps={FPS} width={ARCHITECTURE_WIDTH} height={ARCHITECTURE_HEIGHT}/>
)}</Folder>{(Object.keys(stories) as Scene[]).map(scene =>
  <Folder key={scene} name={scene}>
    {variants.flatMap(variant => languages.map(language => {
      const id = `${scene}-${variant}-${language}`;
      return <Composition key={id} id={id} component={SceneArt}
        defaultProps={{scene, variant, language}} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT}/>;
    }))}
  </Folder>)}</>;
