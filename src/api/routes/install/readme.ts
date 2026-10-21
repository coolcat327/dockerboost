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
- install_docker.sh：交互安装脚本。
- uninstall_docker.sh：按安装记录恢复的离线卸载脚本。
- SHA256SUMS：传输完整性校验值，不是独立的官方发布签名。

目标系统须提前安装 iptables 软件包（提供 iptables 和 ip6tables）；Docker 静态包不包含这些系统工具。Debian/Ubuntu 联网时可运行 sudo apt-get update && sudo apt-get install -y iptables；完全离线时需在相同发行版、版本和架构的联网环境准备软件包及其依赖后安装。

## 1. 复制、解压和校验

在联网机器下载完整 TAR 包，然后复制到目标机器。TAR 内包含与文件名同名的顶层文件夹，直接解压即可集中存放：

\`\`\`bash
tar -xf docker-offline-${arch}-docker-${docker}-compose-${compose}.tar
cd docker-offline-${arch}-docker-${docker}-compose-${compose}
sha256sum -c SHA256SUMS
uname -m
\`\`\`

确认所有校验均为 OK，且机器架构与 ${arch} 匹配。armhf 对应的 uname 输出通常为 armv7l。

## 2. 自动安装（推荐）

\`\`\`bash
sudo sh install_docker.sh
\`\`\`

若存在脚本同目录下的 daemon.json.bak，脚本直接复用该备份并跳过配置询问；否则询问数据目录（默认 /var/lib/docker）、镜像源（默认空，不启用加速；也可输入 none 禁用）、日志大小（10m）、日志数量（3）和 live-restore（true）。按回车使用默认值。
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

## 8. 离线卸载和恢复

先停止正在运行的容器，再执行：

\`\`\`bash
sudo sh uninstall_docker.sh
\`\`\`

安装记录 install-state/、配置备份 daemon.json.bak 和临时锁目录 .offline-install.lock/ 均放在安装、卸载脚本所在目录。请保留整个解压目录，后续从同一套目录安装或卸载；换一个没有安装记录的目录不会接管现有安装。重复安装同一版本时直接成功，保留安装后修改的配置；已有其他版本的记录时先卸载再安装。不覆盖已有 Docker、Compose、containerd 等程序或服务。
卸载仍要求配套安装记录；未执行过新版安装、使用旧版脚本或手动安装时直接退出，不删除现有 Docker。允许修改 daemon.json、服务及其他已安装文件，不再要求与初始文件内容一致。卸载先连接本机 Docker 查询运行中的容器；有运行中的容器或活动服务无法查询时立即退出，不停止服务或删除文件。若 daemon 不可连接且服务已停止，则通过 procps 提供的 pgrep 检查 live-restore 残留的容器进程；无法检查或仍有残留进程时停止卸载。
卸载前将当前 daemon.json 的实际内容（包括符号链接指向的配置）备份到脚本同目录下的 daemon.json.bak，然后移除安装清单中的程序、Compose 插件、服务、启动链接及 Docker 服务覆盖配置。备份保存在脚本同目录，不随程序卸载删除，重复卸载不覆盖它；下次安装自动复用，并在启动服务前用 dockerd 校验原样配置。备份无效时安装报错并保留记录，不静默改写备份。父目录被换成符号链接等不安全路径仍会拒绝操作。
安装记录只保存版本、进度和卸载文件清单，不保存程序或配置的逐文件快照。安装失败可先运行卸载脚本清理后重新安装。不要手动删除安装记录或备份。两个脚本使用脚本同目录下的 .offline-install.lock/ 互斥；强制终止（例如 SIGKILL）可能留下锁，需确认没有安装/卸载进程后再移除该锁目录。
镜像、容器、卷、Docker 数据目录及 daemon 产生的运行时数据不会自动删除，因此这是程序和服务的卸载，不是整机快照恢复。卸载检测到运行中的容器时会拒绝继续。

## 排查和维护

服务启动失败：sudo journalctl -u docker -n 100 --no-pager，检查内核、iptables、cgroups 和配置错误。
普通用户权限不足时先使用 sudo；docker 用户组具有接近 root 的权限，只应添加可信用户。
更新时重新下载对应架构安装包，备份配置及业务数据，停止服务后按计划替换全部程序，再验证并重启。

官方说明：https://docs.docker.com/engine/install/binaries/
Compose 说明：https://docs.docker.com/compose/install/linux/
`;
}
