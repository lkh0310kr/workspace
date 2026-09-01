import { EventEmitter } from "node:events";
import type { AssetOpenRequest, ImportJob, ImportJobPhase, SceneManifest } from "../../shared/model3d/types";
import { pipelineForRequest } from "../../shared/model3d/orchestration";
import { model3dLog } from "./model3dLog";

let nextJobId = 1;

export type ImportJobListener = (job: ImportJob) => void;

export class ImportJobQueue extends EventEmitter {
  private readonly jobs = new Map<string, ImportJob>();

  getJob(id: string): ImportJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): ImportJob[] {
    return [...this.jobs.values()];
  }

  async enqueue(
    request: AssetOpenRequest,
    run: () => Promise<SceneManifest>,
  ): Promise<ImportJob> {
    const id = `import-${nextJobId++}`;
    const pipeline = pipelineForRequest(request);
    let job = this.insert({
      id,
      request,
      pipeline,
      phase: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    model3dLog("import_job_queued", { jobId: id, pipeline, relativePath: request.relativePath });

    try {
      job = this.advance(id, "sniffing");
      job = this.advance(id, "converting");
      const manifest = await run();
      job = this.advance(id, "caching");
      job = this.finish(id, manifest);
      model3dLog("import_job_ready", {
        jobId: id,
        status: manifest.status,
        format: manifest.source.format,
      });
      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job = this.fail(id, message);
      model3dLog("import_job_failed", { jobId: id, error: message });
      return job;
    }
  }

  failFast(request: AssetOpenRequest, error: string): ImportJob {
    const id = `import-${nextJobId++}`;
    const job = this.insert({
      id,
      request,
      pipeline: pipelineForRequest(request),
      phase: "failed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      error,
    });
    model3dLog("import_job_fail_fast", { jobId: id, pipeline: job.pipeline, error });
    return job;
  }

  private insert(job: ImportJob): ImportJob {
    this.jobs.set(job.id, job);
    this.emit("update", job);
    return job;
  }

  private advance(id: string, phase: ImportJobPhase): ImportJob {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`Import job not found: ${id}`);
    const job: ImportJob = { ...current, phase, updatedAt: Date.now() };
    this.jobs.set(id, job);
    this.emit("update", job);
    return job;
  }

  private finish(id: string, manifest: SceneManifest): ImportJob {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`Import job not found: ${id}`);
    const job: ImportJob = {
      ...current,
      phase: "ready",
      manifest,
      updatedAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.emit("update", job);
    return job;
  }

  private fail(id: string, error: string): ImportJob {
    const current = this.jobs.get(id);
    if (!current) throw new Error(`Import job not found: ${id}`);
    const job: ImportJob = { ...current, phase: "failed", error, updatedAt: Date.now() };
    this.jobs.set(id, job);
    this.emit("update", job);
    return job;
  }
}

export const importJobQueue = new ImportJobQueue();
