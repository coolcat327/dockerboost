import {Config} from '@remotion/cli/config';

// Use a shared palette and preserve unchanged pixels between frames.
Config.overrideFfmpegCommand(({args}) =>
  args.map(arg => arg === 'split[v],palettegen,[v]paletteuse'
    ? 'split[v],palettegen=max_colors=128:stats_mode=diff,[v]paletteuse=dither=0:diff_mode=rectangle'
    : arg),
);
