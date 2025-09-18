import { hopeTheme } from "vuepress-theme-hope";

import navbar from "./navbar.js";
import sidebar from "./sidebar.js";

export default hopeTheme({
  hostname: "https://rookiiie.top",
  author: {
    name: "MorseWayne",
    url: "https://rookiiie.top",
  },

  logo: "/books.svg",
  repo: "MorseWayne/programming_journey",
  docsDir: "docs",
  darkmode: "switch",
  toggle: true,

  // 导航栏
  navbar,

  // 侧边栏
  sidebar,

  // 页脚
  // footer: "默认页脚",
  displayFooter: true,

  // 加密配置
  encrypt: {
    config: {
      "/demo/encrypt.html": {
        hint: "Password: 1234",
        password: "1234",
      },
    },
  },

  // 多语言配置
  metaLocales: {
    editLink: "在 GitHub 上编辑此页",
  },

  // 如果想要实时查看任何改变，启用它。注: 这对更新性能有很大负面影响
  // hotReload: true,

  // 此处开启了很多功能用于演示，你应仅保留用到的功能。
  markdown: {
    align: true,
    attrs: true,
    codeTabs: true,
    component: true,
    demo: true,
    figure: true,
    gfm: true,
    imgLazyload: true,
    imgSize: true,
    include: true,
    mark: true,
    plantuml: true,
    spoiler: true,
    stylize: [
      {
        matcher: "Recommended",
        replacer: ({ tag }) => {
          if (tag === "em")
            return {
              tag: "Badge",
              attrs: { type: "tip" },
              content: "Recommended",
            };
        },
      },
    ],
    sub: true,
    sup: true,
    tabs: true,
    tasklist: true,
    vPre: true,

    // 取消注释它们如果你需要 TeX 支持
    math: {
      // 启用前安装 katex
      type: "katex",
    },

    // 如果你需要幻灯片，安装 @vuepress/plugin-revealjs 并取消下方注释
    // revealjs: {
    //   plugins: ["highlight", "math", "search", "notes", "zoom"],
    // },

    // 在启用之前安装 chart.js
    // chartjs: true,

    // insert component easily

    // 在启用之前安装 echarts
    // echarts: true,

    // 在启用之前安装 flowchart.ts
    // flowchart: true,

    // 在启用之前安装 mermaid
    mermaid: true,

    // playground: {
    //   presets: ["ts", "vue"],
    // },

    // 在启用之前安装 @vue/repl
    // vuePlayground: true,

    // 在启用之前安装 sandpack-vue3
    // sandpack: true,
  },

  // 在这里配置主题提供的插件
  plugins: {
    // 启用博客功能
    blog: true,
    // 注意: 仅用于测试! 你必须自行生成并在生产环境中使用自己的评论服务
    // comment: {
    //   provider: "Giscus",
    //   repo: "MorseWayne/programming_journey",
    //   repoId: "R_kgDOJ6n4-Q",
    //   category: "Announcements",
    //   categoryId: "DIC_kwDOJ6n4-c4CuAVl",
    // },

    comment: {
      provider: "Waline",
      serverURL: "https://programmingjourneycomments.vercel.app/", // your server url
    },

    components: {
      components: ["Badge", "VPCard"],
    },

    icon: {
      assets: "fontawesome",
    },

    // 如果你需要 PWA。安装 @vuepress/plugin-pwa 并取消下方注释
    pwa: {
      favicon: "/books.svg",
      cacheHTML: false,
      cacheImage: true,
      appendBase: true,
      // apple: {
      //   icon: "/assets/icon/apple-icon-152.png",
      //   statusBarColor: "black",
      // },
      // manifest: {
      //   icons: [
      //     {
      //       src: "/assets/icon/chrome-mask-512.png",
      //       sizes: "512x512",
      //       purpose: "maskable",
      //       type: "image/png",
      //     },
      //     {
      //       src: "/assets/icon/chrome-mask-192.png",
      //       sizes: "192x192",
      //       purpose: "maskable",
      //       type: "image/png",
      //     },
      //     {
      //       src: "/assets/icon/chrome-512.png",
      //       sizes: "512x512",
      //       type: "image/png",
      //     },
      //     {
      //       src: "/assets/icon/chrome-192.png",
      //       sizes: "192x192",
      //       type: "image/png",
      //     },
      //   ],
      //   shortcuts: [
      //     {
      //       name: "Demo",
      //       short_name: "Demo",
      //       url: "/demo/",
      //       icons: [
      //         {
      //           src: "/assets/icon/guide-maskable.png",
      //           sizes: "192x192",
      //           purpose: "maskable",
      //           type: "image/png",
      //         },
      //       ],
      //     },
      //   ],
      // },
    },
  },

  // 博客相关
  blog: {
    description: "一个不太聪明的开发者",
    intro: "/intro.html",
    medias: {
      Baidu: "https://example.com",
      BiliBili: "https://example.com",
      Bitbucket: "https://example.com",
      Dingding: "https://example.com",
      Discord: "https://example.com",
      Dribbble: "https://example.com",
      Email: "mailto:info@example.com",
      Evernote: "https://example.com",
      Facebook: "https://example.com",
      Flipboard: "https://example.com",
      Gitee: "https://example.com",
      GitHub: "https://example.com",
      Gitlab: "https://example.com",
      Gmail: "mailto:info@example.com",
      Instagram: "https://example.com",
      Lark: "https://example.com",
      Lines: "https://example.com",
      Linkedin: "https://example.com",
      Pinterest: "https://example.com",
      Pocket: "https://example.com",
      QQ: "https://example.com",
      Qzone: "https://example.com",
      Reddit: "https://example.com",
      Rss: "https://example.com",
      Steam: "https://example.com",
      Twitter: "https://example.com",
      Wechat: "https://example.com",
      Weibo: "https://example.com",
      Whatsapp: "https://example.com",
      Youtube: "https://example.com",
      Zhihu: "https://example.com",
      VuePressThemeHope: {
        icon: "https://theme-hope-assets.vuejs.press/logo.svg",
        link: "https://theme-hope.vuejs.press",
      },
    },
  },
});
