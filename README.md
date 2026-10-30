# Synaptik BullMQ

Library to use `@sektek/synaptik` with BullMQ. It translates between BullMQ jobs and synaptik `Event`s:

| Class | Role |
|-------|------|
| `BullMqChannel` | Producer: enqueues each event as a BullMQ job |
| `BullMqGateway` | Consumer: runs a BullMQ `Worker` that passes each job's event to a handler |

## Installation

```sh
npm install @sektek/synaptik-bullmq
```

BullMQ needs a running Redis server.

## Enqueuing events: `BullMqChannel`

`BullMqChannel` implements the synaptik channel contract (`send(event)`), so it can be used anywhere a channel is accepted. Each event becomes the job's data.

```ts
import { Queue } from 'bullmq';
import { BullMqChannel } from '@sektek/synaptik-bullmq';

const queue = new Queue('orders', { connection: { host: 'localhost', port: 6379 } });
const channel = new BullMqChannel({ queue });

await channel.send({ id: 'order-1', type: 'order.created', data: { total: 42 } });
```

| Option | Default | Description |
|--------|---------|-------------|
| `queue` | required | The BullMQ `Queue` to add jobs to. You create it and own its lifecycle. |
| `jobNameProvider` | `event.id` | Derives the job name from each event. |
| `jobsOptionsProvider` | sets `jobId` to the job name | Builds the BullMQ `JobsOptions` for each event. |

`send(event, options?)` accepts BullMQ `JobsOptions` (such as `delay`, `attempts`, `priority`, or `removeOnComplete`) for a single call. The default `jobsOptionsProvider` merges them with `jobId: <jobName>`.

> **Deduplication:** by default the job name is the event id and the `jobId` is the job name. BullMQ ignores a job whose `jobId` already exists in the queue, so sending an event with the same `id` twice does not enqueue a second job. Supply a `jobsOptionsProvider` that returns different (or no) `jobId` if you need otherwise.

### Events

| Event | Arguments |
|-------|-----------|
| `event:received` | `event` |
| `event:delivered` | `event` |
| `event:error` | `error, event` |
| `job:created` | `job` |

`send` rethrows after emitting `event:error`.

## Processing jobs: `BullMqGateway`

`BullMqGateway` creates a BullMQ `Worker` when started. For each job it extracts an `Event` (by default `job.data`) and passes it to the handler. If the handler throws, the error is rethrown so BullMQ marks the job as failed and applies its own retry settings.

```ts
import { BullMqGateway } from '@sektek/synaptik-bullmq';

const gateway = new BullMqGateway({
  queueName: 'orders',
  connection: { host: 'localhost', port: 6379 },
  handler: async event => {
    console.log('received', event.type, event.data);
  },
});

await gateway.start();
// ...
await gateway.stop();
```

| Option | Default | Description |
|--------|---------|-------------|
| `handler` | required | Event handler (function or object with `handle`). |
| `queueName` | | Name of the queue to consume. |
| `queue` | | A `Queue`, from which the name is taken. Either `queueName` or `queue` is required; the constructor throws otherwise. `queueName` wins if both are given. |
| `connection` | `{ host: 'localhost', port: 6379 }` | BullMQ connection options for the worker. |
| `eventExtractor` | `job.data` | Converts a `Job` into an `Event`. |

`stop()` closes the worker. `start()` also registers `stop` for `SIGINT` and `SIGTERM`, so a running gateway shuts its worker down on those signals.

### Events

`BullMqGateway` emits the standard synaptik handler events (`event:received`, `event:processed`, `event:error`) plus:

| Event | Arguments | When |
|-------|-----------|------|
| `job:received` | `job` | A job is picked up, before extraction. |
| `job:completed` | `job` | The handler succeeded. |
| `job:error` | `error, job` | The job failed. |

`event:error` is emitted for handler failures. A failure in the event extractor surfaces as `job:error` only, since no event exists yet.

## Producer and consumer together

```ts
const queue = new Queue('orders', { connection });

const gateway = new BullMqGateway({
  queue,
  connection,
  handler: async event => {
    /* ... */
  },
});
const channel = new BullMqChannel({ queue });

await gateway.start();
await channel.send({ id: 'order-1', type: 'order.created', data: {} });
```

The channel and gateway only share the queue name; they can live in different processes.

## Looking up jobs

`JobProvider` resolves a job by id on a queue, or `undefined` when there is none. The default `BullMqChannel` uses the event id as the job id, so an enqueued event can be looked up by its id:

```ts
const provider = new JobProvider({ queue });

await channel.send(event);

const job = await provider.get(event.id);
const state = await job?.getState();
```

## Pluggable components

Each dependency below can be supplied as a plain function or as an object with the named method:

| Option | Method | Signature |
|--------|--------|-----------|
| `jobNameProvider` | `get` | `(event) => string` |
| `jobsOptionsProvider` | `get` | `(event, jobName?, options?) => JobsOptions` |
| `eventExtractor` | `extract` | `(job) => Event` |

```ts
new BullMqChannel({
  queue,
  jobNameProvider: event => `${event.type}:${event.id}`,
  jobsOptionsProvider: (_event, jobName, options) => ({
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    ...options,
    jobId: jobName,
  }),
});
```

## Types

All option and component types (`BullMqChannelOptions`, `JobNameProviderFn`, `JobEventExtractorComponent`, `JobsOptionsProviderComponent`, ...) are exported from the package root.
