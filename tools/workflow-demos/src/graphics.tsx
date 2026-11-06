import type {CSSProperties, ReactNode} from 'react';
import {ease, linear, move} from './motion';

const icons = {
  box: 'M3 7l9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7M12 11v10m-4-16 9 4',
  layers: 'm2 8 10-5 10 5-10 5L2 8Zm1 5 9 4.5 9-4.5M3 18l9 4 9-4',
  terminal: 'M3 5h18v14H3zM6.5 9l3 3-3 3M12 15h5',
  link: 'm10 13 4-4m-5 7-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m0 8a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-1 1',
  stack: 'M4 4h16v6H4zM4 14h16v6H4zM7 7h.1M7 17h.1M11 7h6M11 17h6',
  file: 'M5 2h9l5 5v15H5zM14 2v6h5M8 13h8m-8 4h6',
  chip: 'M6 6h12v12H6zM9 9h6v6H9zM9 3v3m6-3v3m-6 12v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3',
  check: 'm5 12 4 4L19 6',
  arrow: 'M3 12h17m-6-6 6 6-6 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-5 5-5 13 0 18 5-5 5-13 0-18ZM3 12h18',
  bolt: 'm13 2-8 12h7l-1 8 8-12h-7l1-8Z',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1.5 4.5L21 21',
  copy: 'M8 8h12v12H8zM5 16H4V4h12v1',
  lock: 'M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3m-4 4v3',
};
export type IconName = keyof typeof icons;

export function Icon({name, size = 24}: {name: IconName; size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[name]}/></svg>;
}

export function Reveal({frame, at, children, style}: {
  frame: number; at: number; children: ReactNode; style?: CSSProperties;
}) {
  const p = move(frame, at, at + 14);
  return <div style={{...style, opacity: p, transform: `translateY(${13 * (1 - p)}px)`}}>{children}</div>;
}

export function Panel({title, icon, children, width = 425}: {
  title: string; icon: IconName; children: ReactNode; width?: number;
}) {
  return <div className="panel" style={{width}}>
    <div className="panel-header"><Icon name={icon} size={20}/>{title}<i/><i/><i/></div>
    <div className="panel-body">{children}</div>
  </div>;
}

export function Action({icon, children, active = true, click}: {
  icon: IconName; children: ReactNode; active?: boolean; click?: {frame: number; at: number};
}) {
  return <span className={active ? 'action active' : 'action'}>
    <Icon name={icon} size={19}/>{children}
    {click && <Cursor {...click} x={35} y={14}/>}
  </span>;
}

export function Tag({children, accent = false}: {children: ReactNode; accent?: boolean}) {
  return <span className={accent ? 'tag accent' : 'tag'}>{children}</span>;
}

export function Cursor({frame, at, x, y}: {frame: number; at: number; x: number; y: number}) {
  const arrival = move(frame, at - 14, at);
  const ring = linear(frame, at, at + 13);
  const exit = move(frame, at + 15, at + 22);
  return <span className="cursor" style={{left: x - 57 * (1 - arrival), top: y + 34 * (1 - arrival), opacity: arrival * (1 - exit)}}>
    <span style={{opacity: 1 - ring, transform: `scale(${.28 + ring * 1.3})`}}/>
    <svg width="27" height="30" viewBox="0 0 27 30" fill="none">
      <path d="M3 2v23l6-6 5 8 4-2-5-8 9-1L3 2Z" fill="#fff" stroke="#101b2e" strokeWidth="2" strokeLinejoin="round"/>
    </svg>
  </span>;
}

export function FileCard({label, detail, icon = 'file', ready = false}: {
  label: string; detail: string; icon?: IconName; ready?: boolean;
}) {
  return <div className={ready ? 'file-card ready' : 'file-card'}>
    <div className="file-symbol"><Icon name={icon} size={31}/></div>
    <strong>{label}</strong><small>{detail}</small>
  </div>;
}

export function TerminalLine({children, muted = false, continuation = false}: {
  children: ReactNode; muted?: boolean; continuation?: boolean;
}) {
  return <div className={muted ? 'terminal-line muted' : 'terminal-line'}><b>{muted || continuation ? '›' : '$'}</b><code>{children}</code></div>;
}

export function Meter({progress}: {progress: number}) {
  return <div className="meter"><i style={{width: `${progress * 100}%`}}/></div>;
}

export function FlowRail({frame, at, label, icon}: {frame: number; at: number; label: string; icon: IconName}) {
  const p = ease(frame - at, 29);
  return <div className="flow-rail">
    <svg width="100%" height="46" viewBox="0 0 160 46" preserveAspectRatio="none">
      <path d="M12 30 Q80 -2 148 30" fill="none" stroke="var(--edge)" strokeWidth="2" strokeDasharray="4 6"/>
      <path d="M12 30 Q80 -2 148 30" fill="none" stroke="var(--accent)" strokeWidth="2" pathLength="1" strokeDasharray={`${p} 1`}/>
      <path d="m146 24 7 6-7 6" fill="none" stroke="var(--accent)" strokeWidth="2"/>
    </svg>
    <div className="rail-token" style={{left: `${7.5 + 85 * p}%`, top: 30 - 64 * p * (1 - p)}}><Icon name={icon} size={23}/></div>
    <small>{label}</small>
  </div>;
}

export function NodeCard({icon, title, children}: {icon: IconName; title: string; children: ReactNode}) {
  return <div className="node-card">
    <div className="node-symbol"><Icon name={icon} size={37}/></div>
    <strong>{title}</strong>
    {children}
  </div>;
}
