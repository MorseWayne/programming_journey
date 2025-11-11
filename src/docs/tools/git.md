---
title: git命令别名配置建议
icon: /assets/icons/article.svg
order: 1
category:
  - Tools
date: 2025-11-11
---

常见git命令别名配置建议：

```bash
git config --global alias.st status
git config --global alias.df diff
git config --global alias.dc "diff --cached"
git config --global alias.br branch
git config --global alias.co checkout
git config --global alias.cb "checkout -b"
git config --global alias.bd "branch -d"
git config --global alias.ci commit
git config --global alias.cm "commit -m"
git config --global alias.ca "commit --amend"
git config --global alias.lg "log --oneline --graph --decorate"
git config --global alias.last "log -1 HEAD"
git config --global alias.hist "log --pretty=format:\"%h %ad | %s%d [%an]\" --graph --date=short"
git config --global alias.pl pull
git config --global alias.ps push
git config --global alias.po "push origin"
git config --global alias.cl clone
git config --global alias.unstage "reset HEAD --"
git config --global alias.alias "!git config --get-regexp ^alias\\."
```

