---
title: NATS 安装
icon: /assets/icons/article.svg
order: 1
category:

  - Middleware
date: 2025-11-05
---

## 1 安装NATS server

访问官方[release](https://github.com/nats-io/nats-server/releases/)找到对应环境的二进制包，以ubuntu为例

```bash
# 下载
curl -L https://github.com/nats-io/nats-server/releases/download/v2.12.1/nats-server-v2.12.1-linux-amd64.tar.gz -o nats-server.tar.gz

# 解压并安装
# 解压
tar -xzf nats-server.tar.gz

# 移动到系统路径
sudo mv nats-server/nats-server /usr/local/bin/

# 验证安装
nats-server --version
```

## 2 安装NATS CLI

```bash
# 1. 运行官方安装脚本
curl -sf https://binaries.nats.dev/nats-io/natscli/nats@latest | sh

# 2. 脚本会下载到当前目录，手动移动到系统路径
sudo mv ./nats /usr/local/bin/

# 3. 添加执行权限
sudo chmod +x /usr/local/bin/nats

# 4. 验证
nats --version
```
