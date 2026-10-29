import { decideVisibility, jobRunSchema } from "./job_visibility.js";

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

console.log(JSON.stringify(decideVisibility(run), null, 2));
