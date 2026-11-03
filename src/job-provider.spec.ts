import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { ResourceNotFoundError, optional } from '@sektek/utility-belt';
import { EventBuilder } from '@sektek/synaptik';
import { Queue } from 'bullmq';

import { BullMqChannel } from './bull-mq-channel.js';
import { JobProvider } from './job-provider.js';

use(chaiAsPromised);

const host = process.env.REDIS_HOST || 'localhost';
const port = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

describe('JobProvider', function () {
  let queue: Queue;

  before(function () {
    queue = new Queue('test-job-provider', { connection: { host, port } });
  });

  afterEach(async function () {
    await queue.drain();
  });

  after(async function () {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  it('should return an existing job', async function () {
    const event = await EventBuilder.create();
    await new BullMqChannel({ queue }).send(event);
    const provider = new JobProvider({ queue });

    const job = await provider.get(event.id);

    expect(job).to.exist;
    expect(job?.id).to.equal(event.id);
    expect(job?.data).to.deep.equal(event);
  });

  it('should throw ResourceNotFoundError for an unknown id', async function () {
    const provider = new JobProvider({ queue });

    const err = await provider.get('missing').catch(e => e);

    expect(err).to.be.instanceOf(ResourceNotFoundError);
    expect(err.resource).to.equal('Job');
    expect(err.id).to.equal('missing');
  });

  it('should return undefined for an unknown id when wrapped in optional()', async function () {
    const provider = optional(new JobProvider({ queue }));

    await expect(provider.get('missing')).to.eventually.be.undefined;
  });
});
