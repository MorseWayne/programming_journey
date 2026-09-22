import { navbar } from "vuepress-theme-hope";

// 顶栏只展示阅读入口；具体技术与文章在各专题目录及侧栏中查找。
export default navbar([
  "/",
  {
    text: "系统课程",
    icon: "/assets/icons/server.svg",
    link: "/docs/platform_engineering/",
  },
  {
    text: "基础知识",
    icon: "/assets/icons/brain.svg",
    children: [
      { text: "计算机基础", icon: "/assets/icons/brain.svg", link: "/docs/cs_basics/" },
      { text: "编程语言", icon: "/assets/icons/programming.svg", link: "/docs/language/" },
    ],
  },
  {
    text: "后端技术",
    icon: "/assets/icons/server.svg",
    children: [
      { text: "数据库", icon: "/assets/icons/database.svg", link: "/docs/database/" },
      { text: "中间件", icon: "/assets/icons/middleware.svg", link: "/docs/middleware/" },
      { text: "Web 服务", icon: "/assets/icons/server.svg", link: "/docs/web_server/" },
    ],
  },
  {
    text: "AI 专题",
    icon: "/assets/icons/brain.svg",
    link: "/docs/ai/",
  },
  {
    text: "实践与成长",
    icon: "/assets/icons/project.svg",
    children: [
      { text: "个人项目", icon: "/assets/icons/project.svg", link: "/docs/projects/" },
      { text: "工具与效率", icon: "/assets/icons/programming.svg", link: "/docs/tools/" },
      { text: "面试经历", icon: "/assets/icons/job.svg", link: "/docs/interview/" },
      { text: "个人成长", icon: "user", link: "/docs/personal/" },
    ],
  },
]);
