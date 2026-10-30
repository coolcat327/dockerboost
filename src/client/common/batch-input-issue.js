// Shared by the pull and download batch inputs; preserve unknown parser errors.
export function batchInputIssue(value, english) {
  if (english) return value;
  return value
    .replace(/Line (\d+): invalid image/g, '第 $1 行：镜像格式无效')
    .replace('Input exceeds 1 MiB', '输入不能超过 1 MiB')
    .replace('missing image (build is not executed)', '未配置 image；不执行 build')
    .replace('unresolved variable or invalid platform', '变量未展开或平台格式无效')
    .replace('invalid image or platform', '镜像或平台格式无效')
    .replace('extends requires docker compose config', 'extends 请先用 docker compose config 展开')
    .replace('invalid service', '服务格式无效')
    .replace('Please choose one Compose YAML file', '请一次选择一个 Compose YAML 文件')
    .replace('Choose a .yaml, .yml or .txt file', '请选择 .yaml、.yml 或 .txt 文件')
    .replace('Compose exceeds 1 MiB', 'Compose 文件不能超过 1 MiB');
}
