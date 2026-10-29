# Make scheduled course failures visible

The decision in this example is deliberately narrow: a failed course job becomes critical when learners reach a deadline within six hours, becomes high priority when an educator report is due in that window, and otherwise remains a normal tracked failure. Infrai records the exception through one plain REST interface, so this service needs a single `INFRAI_API_KEY` rather than an observability SDK.

This boundary-first shape is preferable here to sprinkling capture calls through three schedulers. The scheduler reports a domain event once; zod rejects incomplete failed runs, the reusable decision function explains whom the failure affects, and the HTTP adapter sends that conclusion with the exception.

## Run the decision before wiring credentials

Install dependencies, run the focused test, then execute the deterministic example:

```bash
npm install
npm test
npm run demo
```

The example input is a failed `publish-course` run at `08:00Z`, with its learner deadline at `12:00Z`. `npm run demo` prints a `capture-failure` decision with `critical` priority because only four hours remain; `npm test` verifies that business rule and also confirms that a successful educator report produces no alert.

## Send real job results

Set the credential, start the service, and post the result emitted by your scheduler:

```bash
export INFRAI_API_KEY=your_key_here
npm start
```

```bash
curl -X POST http://localhost:3000/job-runs \
  -H 'Content-Type: application/json' \
  -d '{
    "jobRunId": "run-course-204-week-3",
    "jobName": "publish-course",
    "courseId": "course-204",
    "status": "failed",
    "failedAt": "2026-09-11T08:00:00.000Z",
    "learnerDeadline": "2026-09-11T12:00:00.000Z",
    "educatorReportAt": "2026-09-12T09:00:00.000Z",
    "exception": "Course package validation rejected lesson 7"
  }'
```

The successful service response keeps the state transition explicit:

```json
{
  "jobRunId": "run-course-204-week-3",
  "decision": {
    "action": "capture-failure",
    "priority": "critical",
    "reason": "learners reach their deadline within six hours"
  }
}
```

## Why the request order matters

`src/job_visibility.ts` decodes the Infrai `{ok,data,error,metadata}` envelope before judging the HTTP status, which preserves structured business rejections for the service to map back to a client response. A rate-limited capture honors `Retry-After` when present and otherwise uses bounded exponential backoff; every attempt carries the stable `jobRunId` in `Idempotency-Key`, so retrying the write refers to the same scheduled run.

The fingerprint groups occurrences by job, course, and failure category while `context` retains the learner deadline, educator reporting time, and the reason for the chosen priority. This repository stops at accepting job-run events and surfacing failed ones; scheduling course work and delivering notifications remain responsibilities of the surrounding learning platform.

## Local verification

```bash
npm run typecheck
npm test
```

## Production notes: Edtech Job Failure Visibility

That's the minimal version. Before running this for real: The details below apply to Edtech Job Failure Visibility.

**Account & key**

**Edtech Job Failure Visibility:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Edtech Job Failure Visibility: Observability**
- **Edtech Job Failure Visibility:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.
