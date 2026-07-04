# CLAUDE.md — @sektek/synaptik-bullmq

BullMQ/Redis job queue transport adapter for `@sektek/synaptik`. Follows the Gateway/Channel duality pattern: `BullMqGateway` processes jobs as events (worker/consumer), `BullMqChannel` enqueues events as jobs (producer).

## Commands

```bash
npm run build        # Compile (tsc -p tsconfig.build.json)
npm test             # Run all tests (mocha + tsx/esm)
npm run test:cover   # Coverage via c8

# Single test file:
npx mocha --import tsx/esm src/path/to/file.spec.ts
```

## Source layout

```
src/
  types/                          # All TypeScript interfaces and component types
    bull-mq-service-options.ts
    job-event-extractor.ts
    job-name-provider.ts
    jobs-options-provider.ts
  bull-mq-channel.ts              # Producer: enqueues events as BullMQ jobs
  bull-mq-gateway.ts              # Consumer: BullMQ Worker, processes jobs as events
  *.spec.ts                       # Tests co-located with source
```

## Classes

### `BullMqChannel<T>`

Enqueues an `Event` as a BullMQ job.

**Key options (`BullMqChannelOptions`):**

| Option | Default | Purpose |
|--------|---------|---------|
| `queue` | required | BullMQ `Queue` instance |
| `jobNameProvider` | `event.id` | Derives job name from event via `.get` |
| `jobsOptionsProvider` | sets `jobId: jobName` | Derives `JobsOptions` from event via `.get` |

**Processing flow:**
```
send(event) → emit event:received
            → jobNameProvider(event) → job name
            → jobsOptionsProvider(event, jobName, options) → job options
            → queue.add(jobName, event, options)
            → emit event:delivered + job:created
            → error: emit event:error, rethrow
```

**Events emitted:**

| Event | Payload |
|-------|---------|
| `event:received` | `(event)` |
| `event:delivered` | `(event)` |
| `event:error` | `(error, event)` |
| `job:created` | `(job)` |

---

### `BullMqGateway<T>`

Creates a BullMQ `Worker` that processes jobs by extracting an `Event` and invoking a handler.

**Key options (`BullMqGatewayOptions`):**

| Option | Default | Purpose |
|--------|---------|---------|
| `handler` | required | Event endpoint to invoke per job |
| `queueName` / `queue` | — | Queue to consume (at least one required) |
| `connection` | `localhost:6379` | Redis connection options |
| `eventExtractor` | `job.data as Event` | Extracts `Event` from `Job` via `.extract` |
| `workerOptions` | — | Passed to BullMQ `Worker` (excluding `connection`) |

**Processing flow:**
```
start() → create Worker(queueName, processor, { ...workerOptions, connection })

per job: emit job:received
       → eventExtractor(job) → event
       → emit event:received
       → handler(event)
       → success: emit event:processed → Worker emits 'completed' → emit job:completed
       → error:   emit event:error, rethrow → job fails in BullMQ → emit job:error
```

**Methods:** `start()`, `stop()` (`stop` is also registered on `SIGINT`/`SIGTERM`)

**Events emitted:**

| Event | Payload |
|-------|---------|
| `job:received` | `(job)` |
| `job:completed` | `(job)` |
| `job:error` | `(error, job)` |
| `event:received` | `(event)` |
| `event:processed` | `(event, result)` |
| `event:error` | `(error, event)` |

Rethrowing from the processor causes BullMQ to mark the job as failed.

## Types (`src/types/`)

| Type | Description |
|------|-------------|
| `JobNameProviderFn<T>` / `JobNameProviderComponent<T>` | Returns job name string from event via `.get` |
| `JobEventExtractorFn<T>` / `JobEventExtractorComponent<T>` | Extracts `Event` from `Job` via `.extract` |
| `JobsOptionsProviderFn<T>` / `JobsOptionsProviderComponent<T>` | Returns `JobsOptions` from `(event, jobName?, options?)` via `.get` |
| `BullMqServiceOptions` | `EventComponentOptions & { queue?, queueName?, connection?, blockingConnection? }` |

## Testing

Tests run against a **real Redis instance** — there is no mock of BullMQ or ioredis.

```bash
# Connection defaults:
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Patterns:**
- Queues are created in `before()`, drained in `afterEach()`, obliterated in `after()`
- `sinon.fake()` for event handlers and providers
- `sinon.match.has()` for partial object assertions
- `await new Promise(resolve => setTimeout(resolve, 500))` to allow async Worker processing
- `sinon.reset()` in `afterEach` clears call history

## Key constraints

- No new dependencies without explicit approval
- ESM only; imports use `.js` extensions
- Decorators enabled
- Depends on `@sektek/synaptik`, `@sektek/utility-belt`, `bullmq`, `ioredis`, `lodash`
- `workerOptions.connection` is always overridden by the gateway's `connection` option (merged via lodash `_.merge`)
