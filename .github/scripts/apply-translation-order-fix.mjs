import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

function replaceOnce(path, oldText, newText) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(oldText);
  const second = first < 0 ? -1 : source.indexOf(oldText, first + oldText.length);
  if (first < 0 || second >= 0) throw new Error(`${path}: expected exactly one match`);
  writeFileSync(path, source.slice(0, first) + newText + source.slice(first + oldText.length), "utf8");
}

replaceOnce(
  "src/ai/processor.js",
  `export async function scheduleAiForComment(env, input) {
  if (!env?.DB_V2) return { jobs: [], dispatched: 0 };
  const jobs = await createAiJobsForComment(env.DB_V2, input);
  const dispatched = await dispatchAiJobs(env, jobs);
  return { jobs, dispatched };
}`,
  `export async function scheduleAiForComment(env, input, options = {}) {
  if (!env?.DB_V2) return { jobs: [], dispatched: 0 };
  const jobs = await createAiJobsForComment(env.DB_V2, input);
  const dispatched = options.dispatch === false ? 0 : await dispatchAiJobs(env, jobs);
  return { jobs, dispatched };
}`
);

replaceOnce(
  "src/realtime/comment-room.js",
  `import { scheduleAiForComment } from "../ai/processor.js";`,
  `import { dispatchAiJobs, scheduleAiForComment } from "../ai/processor.js";`
);

replaceOnce(
  "src/realtime/comment-room.js",
  `          ai = await scheduleAiForComment(this.env, {
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id
          });`,
  `          ai = await scheduleAiForComment(this.env, {
            organizationId: input.organizationId,
            liveSessionId: input.liveSessionId,
            commentId: result.comment.id
          }, { dispatch: false });`
);

replaceOnce(
  "src/realtime/comment-room.js",
  `      if (event) await this.broadcastEvent(event);
      return authJson({`,
  `      if (event) await this.broadcastEvent(event);
      if (!result.duplicate && ai.jobs.length) {
        const task = dispatchAiJobs(this.env, ai.jobs)
          .catch((error) => console.error("AI queue dispatch failed", String(error?.code || error?.name || "ERROR")));
        if (typeof this.state?.waitUntil === "function") this.state.waitUntil(task);
        else void task;
      }
      return authJson({`
);

replaceOnce(
  "scripts/test-realtime-v2.mjs",
  `function testViewerClient() {
  const source = readFileSync(resolve(ROOT, "public/assets/viewer.js"), "utf8");`,
  `function testViewerClient() {
  const source = readFileSync(resolve(ROOT, "public/assets/viewer.js"), "utf8");
  const roomSource = readFileSync(resolve(ROOT, "src/realtime/comment-room.js"), "utf8");
  const acceptMessageSource = roomSource.slice(roomSource.indexOf("async acceptMessage"), roomSource.indexOf("async deliverEvent"));
  check("translation queue dispatch follows pending marker broadcast", acceptMessageSource.indexOf("markRealtimeCommentTranslationPending") < acceptMessageSource.indexOf("broadcastEvent(event)")
    && acceptMessageSource.indexOf("broadcastEvent(event)") < acceptMessageSource.indexOf("dispatchAiJobs(this.env, ai.jobs)"));`
);

for (const path of [
  ".github/workflows/translation-order-fix.yml",
  ".github/workflows/translation-display-fix-pr.yml",
  ".github/scripts/apply-translation-order-fix.mjs"
]) {
  try { unlinkSync(path); } catch (error) { if (error?.code !== "ENOENT") throw error; }
}

console.log("Applied translation event ordering fix.");
