import { navbar } from "vuepress-theme-hope";

export default navbar([
  "/",
  {
    text: "编程语言",
    prefix: "/docs/language/",
    icon: "/assets/icons/programming.svg",
    children: [
      "cpp/",
      "go/",
      "rust/"
    ],
  },
  {
    text: "数据库",
    prefix: "/docs/database/",
    icon: "/assets/icons/database.svg",
    children: [
      "redis/",
      "hbase/"
    ],
  },
  {
    text: "中间件",
    prefix: "/docs/middleware/",
    icon: "/assets/icons/middleware.svg",
    children: [
      {
        text: "消息队列",
        prefix: "mq/",
        icon: "/assets/icons/mq.svg",
        children: [
          "nats/"
        ],
      }
    ],
  },
  {
    text: "计算机基础",
    prefix: "/docs/cs_basics/",
    icon: "/assets/icons/brain.svg",
    children: [
      "algorithm/",
      "os/",
      "network/"
    ],
  },
  {
    text: "AI专题",
    icon: "/assets/icons/brain.svg",
    link: "/docs/ai/",
    children: [
      { text: "金融AI生态", icon: "/assets/icons/project.svg", link: "/docs/ai/fin-ai-ecosystem/" },
      { text: "OpenCode", icon: "/assets/icons/programming.svg", link: "/docs/ai/opencode/" },
      { text: "Pi Coding Agent", icon: "/assets/icons/programming.svg", link: "/docs/ai/pi/" },
      { text: "Claude Code", icon: "/assets/icons/programming.svg", link: "/docs/ai/claude-code/" },
      { text: "VS Code Copilot", icon: "/assets/icons/programming.svg", link: "/docs/ai/vscode-copilot/" },
      { text: "MCP", icon: "/assets/icons/directory.svg", link: "/docs/ai/mcp/index" },
    ],
  },
  {
    text: "Web Server",
    prefix: "/docs/web_server/",
    icon: "/assets/icons/server.svg",
    children: [
      "nginx/"
    ],
  },
  {
    text: "个人成长",
    icon: "/assets/icons/job.svg",
    children: [
      { text: "我是谁", icon: "user", link: "/docs/personal/intro" },
      { text: "HR 高频问题", icon: "/assets/icons/article.svg", link: "/docs/personal/hr" },
      { text: "职业规划", icon: "/assets/icons/job.svg", link: "/docs/personal/career/" },
    ],
  },
  "/docs/projects/",
  "/docs/tools/",
]);
