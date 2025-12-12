# ArchiveBox 使用指南（Docker Compose）

## 目标

- 使用 Docker Compose 部署并运行 ArchiveBox，配置通用、可复用的环境
- 说明关键环境变量、启动流程、常用操作、可选组件与维护建议

## 前提条件

- 已安装 `docker` 与 `docker compose`
- 准备一个工作目录，例如当前目录 `./`，其中包含：
  - `docker-compose.yml`
  - `./data`（ArchiveBox 数据目录）
  - 可选：`./cookies.txt`（Netscape 格式），用于登录态抓取

## 目录布局

- 绑定宿主机目录到容器内 `/data`：
  - `volumes: - ./data:/data`
- 如果需要登录态：
  - `volumes: - ./cookies.txt:/data/cookies.txt:ro`
  - 并在环境变量中设置 `COOKIES_FILE=/data/cookies.txt`

## 核心配置项（环境变量）

- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：仅用于首启初始化管理员账号，完成后建议从 Compose 中移除
- `ALLOWED_HOSTS`：允许访问的域名列表，例如 `your.domain`
- `CSRF_TRUSTED_ORIGINS`：包含协议的站点 URL，例如 `https://your.domain`
- `COOKIES_FILE`：容器内 cookies 文件路径（Netscape 格式），例如 `/data/cookies.txt`
- `USER_AGENT`：浏览器标识字符串，建议设置为常见桌面 UA，减少被识别为爬虫的概率
- `TIMEOUT` / `MEDIA_TIMEOUT`：超时设置，建议 `TIMEOUT=120`、`MEDIA_TIMEOUT=3600`
- `SEARCH_BACKEND_ENGINE`：
  - `rg`：默认 ripgrep 搜索，无需额外服务
  - `sonic`：启用 Sonic 全文检索，需要 `sonic` 服务与密码
- `SEARCH_BACKEND_HOST_NAME` / `SEARCH_BACKEND_PASSWORD`：当启用 `sonic` 时必填
- 可选 `PUID` / `PGID`：用于 Docker 内外权限一致化（例如 `PUID=911`，`PGID=<宿主机用户组ID>`）

## 示例 Compose 片段（主服务）

```yaml
services:
  archivebox:
    image: archivebox/archivebox:0.8.5rc51
    ports:
      - 8000:8000
    volumes:
      - ./data:/data
      - ./cookies.txt:/data/cookies.txt:ro
    environment:
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=admin
      - ALLOWED_HOSTS=your.domain
      - CSRF_TRUSTED_ORIGINS=https://your.domain
      - PUBLIC_INDEX=True
      - PUBLIC_SNAPSHOTS=True
      - PUBLIC_ADD_VIEW=False
      - SEARCH_BACKEND_ENGINE=rg
      # 如启用 Sonic，请改为：SEARCH_BACKEND_ENGINE=sonic 并设置以下两项
      # - SEARCH_BACKEND_HOST_NAME=sonic
      # - SEARCH_BACKEND_PASSWORD=SOME_SECRET_PASSWORD
      - COOKIES_FILE=/data/cookies.txt
      - TIMEOUT=120
      - MEDIA_TIMEOUT=3600
      - USER_AGENT="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      # 可选：
      # - PUID=911
      # - PGID=1000
```

## 可选组件：Sonic 全文检索

```yaml
services:
  sonic:
    image: archivebox/sonic:latest
    expose:
      - 1491
    environment:
      - SEARCH_BACKEND_PASSWORD=SOME_SECRET_PASSWORD
    volumes:
      - ./data/sonic:/var/lib/sonic/store
```

- 主服务需设置 `SEARCH_BACKEND_ENGINE=sonic`，并将 `SEARCH_BACKEND_HOST_NAME` 指向 `sonic`
- 启动后，建议运行：  
  `docker compose run archivebox update --index-only`

## 初始化与启动

- 首次初始化数据：
  - `docker compose run archivebox init --setup`
  - 创建管理员（也可用 Web UI）：`docker compose run archivebox manage createsuperuser`
- 启动服务：
  - `docker compose up -d`
  - 访问 Web UI：`http://localhost:8000`
- 停止与重启：
  - `docker compose stop`
  - `docker compose restart archivebox`

## 常用操作

- 添加链接：
  - 单条：`docker compose run archivebox add 'https://example.com'`
  - 批量：`docker compose run -T archivebox add < bookmarks.txt`
  - 递归一层外链：追加 `--depth=1`
- 导出索引：
  - HTML：`docker compose run -T archivebox list --html --with-headers > index.html`
  - CSV：`docker compose run -T archivebox list --csv=timestamp,url,title --with-headers > index.csv`
  - 过滤导出：`docker compose run -T archivebox list --html --filter-type=search "keyword" > filtered.html`
- 单快照打包：
  - `zip -r ./<timestamp>.zip ./data/archive/<timestamp>`
  - 或：`tar -czf ./<timestamp>.tar.gz -C ./data/archive <timestamp>`

## 自动任务（可选）

- 调度器服务可添加、重试定时任务（不需要时建议注释或删除）
- 停止并移除现有调度器容器：
  - `docker compose stop archivebox_scheduler`
  - `docker compose rm -f archivebox_scheduler`
  - 如有孤儿容器：`docker compose up -d --remove-orphans`

## 维护与备份

- 备份：
  - 全量：`tar -czf archivebox-data-$(date +%F).tar.gz -C ./ data`
  - 单快照：见“单快照打包”
- 权限：
  - 宿主机权限一致化：`chown -R 911:$(id -g) ./data`
  - 可启用 `PUID/PGID` 使容器与宿主一致
- 清理与诊断：
  - 清理孤儿：`docker compose up -d --remove-orphans`
  - 查看日志：`docker compose logs -f archivebox`

## 安全建议

- 初始化后从 Compose 中移除 `ADMIN_USERNAME`/`ADMIN_PASSWORD`
- 将 `ALLOWED_HOSTS` 与 `CSRF_TRUSTED_ORIGINS` 设置为你的正式域名
- 在公网部署时启用反向代理（如 Nginx/Caddy/Traefik）与 TLS
