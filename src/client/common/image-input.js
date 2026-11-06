// Parse only a single pull command; never evaluate shell syntax.
export function parsePastedPull(value) {
  const text = value.trim();
  if (!/^(?:sudo\s+)?docker\s+(?:image\s+)?pull\b/.test(text)) return null;
  if (/[\r\n;|&`$<>\\]/.test(text)) throw new Error('请只粘贴一条 docker pull 命令');
  const args = text.replace(/^(?:sudo\s+)?docker\s+(?:image\s+)?pull\s*/, '').match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g) || [];
  let image, platform;
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (arg === '--platform' || arg.startsWith('--platform=')) {
      const value = arg === '--platform' ? args[++i] : arg.slice('--platform='.length);
      platform = value?.replace(/^(['"])(.*)\1$/, '$2');
      if (!platform || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)?$/.test(platform)) throw new Error('无效的 --platform 参数');
      continue;
    }
    if (/^--disable-content-trust(?:=(?:true|false))?$/.test(arg) || arg === '-q' || arg === '--quiet') continue;
    if (arg.startsWith('-')) throw new Error('请输入仅下载一个镜像的 docker pull 命令');
    arg = arg.replace(/^(['"])(.*)\1$/, '$2');
    if (image || !/^[a-zA-Z0-9][a-zA-Z0-9._/@:-]*$/.test(arg)) throw new Error('请只提供一个有效镜像名');
    image = arg;
  }
  if (!image) throw new Error('docker pull 命令缺少镜像名');
  return { image: image.replace(/^docker\.io\//, ''), platform };
}
