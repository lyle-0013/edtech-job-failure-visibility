import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import {
  decideVisibility,
  InfraiError,
  infrai,
  jobRunSchema
} from "./job_visibility.js";

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/job-runs") {
    send(response, 404, { error: "route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const run = jobRunSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const decision = decideVisibility(run);

    if (decision.action === "capture-failure") {
      await infrai.errors.capture(run, decision);
    }
    send(response, 200, { jobRunId: run.jobRunId, decision });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "invalid job run", details: error.message });
      return;
    }
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      send(response, error.status, { error: error.code, message: error.message });
      return;
    }
    send(response, 500, { error: "job run could not be processed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Course job visibility service listening on http://localhost:${port}`);
});
