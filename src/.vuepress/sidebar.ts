import { sidebar } from "vuepress-theme-hope";

export default sidebar({
  "/docs/platform_engineering/": [
    { text: "课程导学", children: ["", "business_map", "study_guide", "environment"] },
    {
      text: "一 · 从需求到单进程模型", collapsible: true,
      children: ["stages/01_foundations", "00_system_model", "01_contracts", "02_ownership"],
    },
    {
      text: "二 · 并发、网络与性能", collapsible: true,
      children: ["stages/02_concurrency", "03_concurrency", "04_performance"],
    },
    {
      text: "三 · 持久化与数据正确性", collapsible: true,
      children: ["stages/03_data", "05_storage", "06_transactions", "07_cache_recovery"],
    },
    {
      text: "四 · 跨服务协作与状态归属", collapsible: true,
      children: ["stages/04_distributed", "08_rpc_messages", "09_distributed_state"],
    },
    {
      text: "五 · 平台运行与持续演进", collapsible: true,
      children: ["stages/05_platform", "10_observability", "11_delivery", "12_platform_design"],
    },
    {
      text: "六 · AI 应用的工程交付", collapsible: true,
      children: ["stages/06_ai", "13_python", "14_rag", "15_agents", "16_evaluation"],
    },
    {
      text: "七 · 从业务问题到完整方案", collapsible: true,
      children: ["stages/07_capstone", "17_architecture", "18_capstone"],
    },
    {
      text: "复习与资料", collapsible: true,
      children: ["progress", "references", "teaching_research", "verification"],
    },
  ],
  "/docs/ai/": "structure",
  "/docs/cs_basics/": "structure",
  "/docs/database/": "structure",
  "/docs/interview/": "structure",
  "/docs/language/": "structure",
  "/docs/middleware/": "structure",
  "/docs/personal/": "structure",
  "/docs/projects/": "structure",
  "/docs/tools/": "structure",
  "/docs/web_server/": "structure",
  "/article/": false,
  "/category/": false,
  "/docs/": false,
  "/star/": false,
  "/tag/": false,
  "/timeline/": false,
});
