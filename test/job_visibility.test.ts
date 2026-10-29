import assert from "node:assert/strict";
import test from "node:test";
import { decideVisibility, jobRunSchema } from "../src/job_visibility.js";

test("a failed publication near a learner deadline is critical", () => {
  const run = jobRunSchema.parse({
    jobRunId: "run-course-204-week-3",
    jobName: "publish-course",
    courseId: "course-204",
    status: "failed",
    failedAt: "2026-09-11T08:00:00.000Z",
    learnerDeadline: "2026-09-11T12:00:00.000Z",
    educatorReportAt: "2026-09-12T09:00:00.000Z",
    exception: "Course package validation rejected lesson 7"
  });

  assert.deepEqual(decideVisibility(run), {
    action: "capture-failure",
    priority: "critical",
    reason: "learners reach their deadline within six hours"
  });
});

test("a successful report run does not create an alert", () => {
  const run = jobRunSchema.parse({
    jobRunId: "run-report-204",
    jobName: "build-educator-report",
    courseId: "course-204",
    status: "succeeded",
    learnerDeadline: "2026-09-14T12:00:00.000Z",
    educatorReportAt: "2026-09-12T09:00:00.000Z"
  });

  assert.equal(decideVisibility(run).action, "no-alert");
});
