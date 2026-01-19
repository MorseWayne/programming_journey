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
  "/docs/ai/",
  {
    text: "Web Server",
    prefix: "/docs/web_server/",
    icon: "/assets/icons/server.svg",
    children: [
      "nginx/"
    ],
  },
  "/docs/interview/",
  "/docs/projects/",
  "/docs/tools/",
]);
