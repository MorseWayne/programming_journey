import { defineClientConfig } from "vuepress/client";
import QueueLab from "./components/QueueLab.vue";

export default defineClientConfig({
  enhance({ app }) {
    app.component("QueueLab", QueueLab);
  },
});
