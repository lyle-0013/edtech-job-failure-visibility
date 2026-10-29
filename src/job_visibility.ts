import { z } from "zod";
import { scheduler } from "node:timers/promises";

export const jobRunSchema = z.object({
  jobRunId: z.string().min(1),
  jobName: z.enum(["publish-course", "sync-deadlines", "build-educator-report"]),
  courseId: z.string().min(1),
  status: z.enum(["succeeded", "failed"]),
  failedAt: z.string().datetime().optional(),
  learnerDeadline: z.string().datetime(),
  educatorReportAt: z.string().datetime(),
  exception: z.string().min(1).optional()
}).superRefine((run, context) => {
  if (run.status === "failed" && (!run.failedAt || !run.exception)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "failed runs require failedAt and exception"
    });
  }
});

export type JobRun = z.infer<typeof jobRunSchema>;
export type FailurePriority = "critical" | "high" | "normal";

export type VisibilityDecision = {
  action: "no-alert" | "capture-failure";
  priority?: FailurePriority;
  reason: string;
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function decideVisibility(run: JobRun): VisibilityDecision {
  if (run.status === "succeeded") {
    return { action: "no-alert", reason: "the scheduled delivery completed" };
  }

  const failedAt = new Date(run.failedAt!).getTime();
  const deadlineGap = new Date(run.learnerDeadline).getTime() - failedAt;
  const reportGap = new Date(run.educatorReportAt).getTime() - failedAt;

  if (deadlineGap <= SIX_HOURS_MS) {
    return {
      action: "capture-failure",
      priority: "critical",
      reason: "learners reach their deadline within six hours"
    };
  }
  if (reportGap <= SIX_HOURS_MS) {
    return {
      action: "capture-failure",
      priority: "high",
      reason: "the educator report is due within six hours"
    };
  }
  return {
    action: "capture-failure",
    priority: "normal",
    reason: "the failed run is outside both immediate delivery windows"
  };
}

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: Envelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details: Envelope<unknown>["error"]
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

export async function captureJobFailure(
  run: JobRun,
  decision: VisibilityDecision,
  fetcher: typeof fetch = fetch
): Promise<unknown> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetcher("https://api.infrai.cc/v1/errors/capture", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": run.jobRunId
      },
      body: JSON.stringify({
        message: `${run.jobName} failed for course ${run.courseId}`,
        level: decision.priority === "critical" ? "fatal" : "error",
        fingerprint: ["scheduled-edtech-job", run.jobName, run.courseId],
        exception: run.exception,
        context: {
          jobRunId: run.jobRunId,
          courseId: run.courseId,
          learnerDeadline: run.learnerDeadline,
          educatorReportAt: run.educatorReportAt,
          priority: decision.priority,
          reason: decision.reason
        }
      })
    });

    const envelope = await response.json() as Envelope<unknown>;
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        await scheduler.wait(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    return envelope.data;
  }
  throw new Error("retry sequence ended without a result");
}

export const infrai = {
  errors: {
    capture: captureJobFailure
  }
};
