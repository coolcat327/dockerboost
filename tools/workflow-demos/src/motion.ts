import {Easing, interpolate} from 'remotion';

export const FPS = 20;
export const WIDTH = 768;
export const HEIGHT = 432;
export const BEATS = [0, 54, 108] as const;
export const DURATION = 170;
export const CROSSFADE = 12;
export const LOOP_FADE = 14;

export type BeatFrame = {beat: 0 | 1 | 2; frame: number};

export const move = (frame: number, from: number, to: number) => interpolate(frame, [from, to], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(.22, 1, .36, 1),
});

export const linear = (frame: number, from: number, to: number) => interpolate(frame, [from, to], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
});

export function ease(frame: number, duration: number) {
  const p = linear(frame, 0, duration);
  return p * p * (3 - 2 * p);
}
