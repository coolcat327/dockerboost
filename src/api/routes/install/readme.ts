export function offlineReadme(arch: string, docker: string, compose: string, origin: string): string {
  return `# Docker ${docker} / Compose ${compose} / Linux ${arch} 离线安装指南

作者：coolcat  
网站：${origin}

本安装包适用于 Linux ${arch}，包含 Docker Engine ${docker} 和 Docker Compose ${compose}。
Docker 静态包包含 docker、dockerd、containerd、runc 等程序；Compose 作为 CLI 插件安装，并提供 docker-compose 兼容命令。

## 环境要求

目标机器需要 root 权限、systemd、POSIX sh、tar、grep、coreutils，以及 Docker 所需的 Linux 内核、cgroups、iptables 和网络模块。静态包不会安装系统依赖，请提前准备好这些依赖。
本包面向全新安装。已有 Docker 时，自动安装脚本会退出；手动安装前也应检查已有服务和二进制，避免混用不同版本。
安装过程无需联网；运行容器需要另外准备镜像并用 docker load 导入。静态安装不会自动更新。

## 文件说明

- readme.md：本指南。
- docker-${docker}.tgz：所选架构的 Docker 官方静态程序。
- docker-compose：所选架构的 Compose 程序。
- daemon.json：Docker daemon 默认配置示例。
- docker.service：systemd 服务定义。
- offline_install_docker.sh：交互安装脚本。
- SHA256SUMS：传输完整性校验值，不是独立的官方发布签名。

目标系统须提前安装 iptables 软件包（提供 iptables 和 ip6tables）；Docker 静态包不包含这些系统工具。Debian/Ubuntu 联网时可运行 sudo apt-get update && sudo apt-get install -y iptables；完全离线时需在相同发行版、版本和架构的联网环境准备软件包及其依赖后安装。

## 1. 复制、解压和校验

在联网机器下载完整 TAR 包，然后复制到目标机器。建议在独立目录解压：

\`\`\`bash
mkdir -p docker-offline
tar -xf docker-offline-${arch}-docker-${docker}-compose-${compose}.tar -C docker-offline
cd docker-offline
sha256sum -c SHA256SUMS
uname -m
\`\`\`

确认所有校验均为 OK，且机器架构与 ${arch} 匹配。armhf 对应的 uname 输出通常为 armv7l。

## 2. 自动安装（推荐）

\`\`\`bash
sudo sh offline_install_docker.sh
\`\`\`

脚本询问数据目录（默认 /var/lib/docker）、镜像源（默认空，不启用加速；也可输入 none 禁用）、日志大小（10m）、日志数量（3）和 live-restore（true）。按回车使用默认值。
脚本先检查环境和配置，再复制程序、备份已有 daemon.json、安装服务并启动 Docker。
Docker 程序按官方静态安装示例放在 /usr/bin，docker-compose 兼容命令也放在该目录；Compose 插件放在 /usr/local/lib/docker/cli-plugins。
以下是不用脚本的手动安装步骤。

## 3. 手动安装 Docker 程序

\`\`\`bash
tar -xzf docker-${docker}.tgz
sudo mkdir -p /usr/bin
sudo install -m 755 docker/* /usr/bin/
/usr/bin/docker --version
/usr/bin/dockerd --version
\`\`\`

保持静态包内的程序版本一致，包含 docker-proxy；不要只复制 docker 客户端，否则没有 daemon 和容器运行时。

## 4. 手动安装 Compose

\`\`\`bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo install -m 755 docker-compose /usr/local/lib/docker/cli-plugins/docker-compose
sudo ln -s /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose
docker compose version
docker-compose version
\`\`\`

CLI 插件目录让 docker compose 可用，符号链接让 docker-compose 可用。若链接位置已有文件，请先检查并备份，避免覆盖已有安装。

## 5. 配置 Docker daemon

daemon.json 中 userland-proxy-path 指向 /usr/bin/docker-proxy，必须与程序的安装路径一致，并在校验前确保该文件已安装且可执行；data-root 是镜像、容器与卷的数据目录；registry-mirrors 是 Docker Hub 加速地址；log-opts 限制容器日志的大小和数量；live-restore 允许 daemon 暂时不可用时保留容器运行。
如需改变默认值，先编辑包内 daemon.json。禁用镜像源时将 registry-mirrors 设为 []。数据目录必须可写且磁盘空间充足。

\`\`\`bash
sudo mkdir -p /etc/docker
if sudo test -f /etc/docker/daemon.json; then
  sudo cp -p /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
fi
sudo /usr/bin/dockerd --validate --config-file="$PWD/daemon.json"
sudo install -m 644 daemon.json /etc/docker/daemon.json
\`\`\`

配置无效时先修正，不要启动服务。修改运行中 Docker 的数据目录前应另行规划数据迁移。

## 6. 注册和启动服务

\`\`\`bash
sudo install -m 644 docker.service /etc/systemd/system/docker.service
sudo systemctl daemon-reload
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager
sudo docker info
\`\`\`

docker.service 调用 /usr/bin/dockerd，设置开机启动和故障重启。默认使用 Unix socket，不开放远程 TCP 管理端口。

## 7. 导入离线镜像并运行

\`\`\`bash
sudo docker load -i image.tar
sudo docker images
sudo docker compose version
sudo docker-compose version
# 准备 compose.yaml 及其中使用的所有镜像后：
sudo docker compose up -d --pull never
\`\`\`

离线 Compose 项目还需要准备环境文件、挂载文件和其他外部资源。缺失镜像时应回联网机器下载，而不是在离线机器执行 docker pull。

## 排查和维护

服务启动失败：sudo journalctl -u docker -n 100 --no-pager，检查内核、iptables、cgroups 和配置错误。
普通用户权限不足时先使用 sudo；docker 用户组具有接近 root 的权限，只应添加可信用户。
更新时重新下载对应架构安装包，备份配置及业务数据，停止服务后按计划替换全部程序，再验证并重启。

官方说明：https://docs.docker.com/engine/install/binaries/
Compose 说明：https://docs.docker.com/compose/install/linux/
`;
}
