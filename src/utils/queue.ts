import {resolve} from "path";
import {ColorStreamType} from "../zspec/zcl/zclFrame";

interface Job {
    key?: string | number;
    colorStreamType?: ColorStreamType;
    cancelled: boolean;
    running: boolean;
    start?: () => void;
}

class Queue {
    private jobs: Job[];
    private readonly concurrent: number;

    constructor(concurrent = 1) {
        this.jobs = [];
        this.concurrent = concurrent;
    }

    public async execute<T>(func: () => Promise<T>, key?: string | number, _colorStreamType? : ColorStreamType): Promise<T> {
        const job: Job = {key, colorStreamType: _colorStreamType, cancelled: false, running: false};
        this.jobs.push(job);

        // Minor optimization/workaround: various tests like the idea that a job that is immediately runnable is run without an event loop spin.
        // This also helps with stack traces in some cases, so avoid an `await` if we can help it.
        if (this.getNext() !== job) {
            await new Promise<void>((resolve): void => {
                job.start = (): void => {
                    job.running = true;
                    resolve();
                };

                this.executeNext();
            });
        } else {
            job.running = true;
        }

        try {
            if (job.cancelled === true)
            {
                throw Error('Job is cancelled');
            }
            else
            {
                return await func();
            }
        } finally {
            this.jobs.splice(this.jobs.indexOf(job), 1);
            this.executeNext();
        }
    }

    private executeNext(): void {
        const job = this.getNext();

        if (job) {
            // if we get here, start is always defined for job
            job.start!();
        }
    }

    private getNext(): Job | undefined {
        if (this.jobs.filter((j) => j.running).length > this.concurrent - 1) {
            return undefined;
        }

        for (let i = 0; i < this.jobs.length; i++) {
            const job = this.jobs[i];

            if (!job.running && (!job.key || !this.jobs.find((j) => j.key === job.key && j.running))) {
                return job;
            }
        }

        return undefined;
    }

    public clear(): void {
        this.jobs = [];
    }

    public count(): number {
        let total = 0;
        this.jobs.forEach((element) => { if (!element.cancelled) total++});
        return total;
    }

    public cancelOldRequest(        
        key?: string | number,        
        colorStreamType? : ColorStreamType,
    ): number {
        let cancelled = 0;

        this.jobs.forEach((element) => {
            if (!element.running &&
                key && element.key === key &&
                colorStreamType && element.colorStreamType === colorStreamType)
            {
                element.cancelled = true;
                cancelled++;
            }
        });

        return cancelled;
    }
}

export default Queue;
