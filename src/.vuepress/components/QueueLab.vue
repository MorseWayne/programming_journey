<script setup>
import { computed, ref, useId, watch } from "vue";
import { simulateQueue } from "./queue_model.mjs";
const id = useId();
const arrivals = ref(12), service = ref(10), capacity = ref(20);
const prediction = ref(""), revealed = ref(false);
const valid = computed(() => [arrivals.value, service.value, capacity.value].every(
  (n) => Number.isInteger(n) && n >= 0 && n <= 200
));
const result = computed(() => valid.value
  ? simulateQueue(arrivals.value, service.value, capacity.value)
  : null);
watch([arrivals, service, capacity], () => { revealed.value = false; });
</script>

<template>
  <section class="queue-lab" :aria-labelledby="id + '-title'">
    <h3 :id="id + '-title'">交互实验：容量能解决持续过载吗？</h3>
    <p>每步先接收任务，再处理任务；超过队列容量的到达被拒绝。共模拟 12 步，所有数量均为整数。</p>
    <form @submit.prevent="revealed = true">
      <div class="queue-inputs">
        <label :for="id + '-arrival'">每步到达
          <input :id="id + '-arrival'" v-model.number="arrivals" type="number" min="0" max="200" required>
        </label>
        <label :for="id + '-service'">每步处理能力
          <input :id="id + '-service'" v-model.number="service" type="number" min="0" max="200" required>
        </label>
        <label :for="id + '-capacity'">队列容量
          <input :id="id + '-capacity'" v-model.number="capacity" type="number" min="0" max="200" required>
        </label>
      </div>
      <label :for="id + '-prediction'">先写预测：积压和拒绝会如何变化？
        <textarea :id="id + '-prediction'" v-model="prediction" rows="2" required />
      </label>
      <button type="submit" :disabled="!valid || !prediction.trim()">运行并核对预测</button>
    </form>
    <div v-if="revealed && result" aria-live="polite">
      <p>已处理 {{ result.totalServed }}，已拒绝 {{ result.totalRejected }}，最后积压 {{ result.queued }}。</p>
      <div class="queue-table">
        <table>
          <caption>每一步的排队结果</caption>
          <thead><tr><th>步</th><th>接收</th><th>处理</th><th>拒绝</th><th>积压</th></tr></thead>
          <tbody><tr v-for="row in result.rows" :key="row.tick">
            <td>{{ row.tick }}</td><td>{{ row.accepted }}</td><td>{{ row.served }}</td>
            <td>{{ row.rejected }}</td><td>{{ row.queued }}</td>
          </tr></tbody>
        </table>
      </div>
      <p>只增加容量再运行，然后只改变处理能力。比较两次结果，解释“延后拒绝”和“提高持续处理能力”的区别。</p>
    </div>
    <p class="queue-note">这是离散教学模型，不模拟并行运行中的任务或真实网络。预测仅保留在当前页面，未上传。</p>
  </section>
</template>

<style scoped>
.queue-lab { padding: 1.25rem; margin-block: 1.5rem; border: 1px solid var(--vp-c-divider, #999); border-radius: .75rem; }
.queue-inputs { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 1rem; }
label { display: block; margin-block: .5rem; }
input, textarea { box-sizing: border-box; width: 100%; padding: .5rem; color: inherit; background: transparent; border: 1px solid #888; border-radius: .25rem; font: inherit; }
button { margin-block: .75rem; padding: .6rem 1rem; border: 1px solid #777; border-radius: .3rem; cursor: pointer; color: inherit; background: transparent; font: inherit; }
button:disabled { opacity: .5; cursor: not-allowed; }
.queue-table { overflow-x: auto; }
.queue-note { font-size: .9em; opacity: .8; }
</style>
