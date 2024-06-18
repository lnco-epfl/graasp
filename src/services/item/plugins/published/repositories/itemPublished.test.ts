import { FastifyInstance } from 'fastify';

import build, { clearDatabase } from '../../../../../../test/app.js';
import { saveMember } from '../../../../member/test/fixtures/members.js';
import { ItemTestUtils, expectManyItems } from '../../../test/fixtures/items.js';
import { ItemPublishedRepository } from './itemPublished.js';

// mock datasource
jest.mock('../../../../../plugins/datasource');
const itemPublishedRepository = new ItemPublishedRepository();
const testUtils = new ItemTestUtils();

describe('ItemPublishedRepository', () => {
  let app: FastifyInstance;
  let actor;

  beforeEach(async () => {
    ({ app, actor } = await build());
  });
  afterEach(async () => {
    jest.clearAllMocks();
    await clearDatabase(app.db);
    actor = null;
    app.close();
  });

  describe('getForMember', () => {
    it('get published items for member', async () => {
      const { items } = await testUtils.saveCollections(actor);
      // noise
      const member = await saveMember();
      await testUtils.saveCollections(member);

      const result = await itemPublishedRepository.getForMember(actor.id);
      expectManyItems(result, items);
    });
  });
});
