import { viteBundler } from "@vuepress/bundler-vite";
import { defineUserConfig } from "vuepress";

import theme from "./theme.js";

export default defineUserConfig({
  base: "/programming_journey/",

  lang: "zh-CN",
  title: "编程之旅✨",
  description: "一个普通程序猿的随手笔记",

  bundler: viteBundler({
    viteOptions: {
      build: {
        rolldownOptions: {
          checks: {
            invalidAnnotation: false,
          },
        },
      },
    },
  }),

  theme,

  // 和 PWA 一起启用
  shouldPrefetch: false,
});
