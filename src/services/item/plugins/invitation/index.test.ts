import { StatusCodes } from 'http-status-codes';
import { v4 as uuid } from 'uuid';

import { FastifyInstance } from 'fastify';

import { DiscriminatedItem, HttpMethod } from '@graasp/sdk';

import build, {
  clearDatabase,
  mockAuthenticate,
  unmockAuthenticate,
} from '../../../../../test/app';
import { buildRepositories } from '../../../../utils/repositories';
import { Item } from '../../../item/entities/Item';
import { ItemTestUtils } from '../../../item/test/fixtures/items';
import { saveItemLoginSchema } from '../../../itemLogin/test/index.test';
import { Member } from '../../../member/entities/member';
import { saveMember } from '../../../member/test/fixtures/members';

const testUtils = new ItemTestUtils();

function expectItemMembershipToBe(itemMembership, member?: Member, item?: Item) {
  if (member) {
    expect(itemMembership.creator.id).toBe(member.id);
    expect(itemMembership.creator.email).toBe(member.email);
  } else {
    expect(itemMembership.creator).toBeUndefined();
  }
  if (item) {
    expect(itemMembership.item.id).toBe(item.id);
    expect(itemMembership.item.path).toBe(item.path);
  } else {
    expect(itemMembership.item).toBeUndefined();
  }
}
describe('Invitation', () => {
  let app: FastifyInstance;
  let member: Member;
  let creator: Member;
  let item: Item;

  beforeAll(async () => {
    ({ app } = await build({ member: null }));
  });

  beforeEach(async () => {
    member = await saveMember();
    creator = await saveMember();
    ({ item } = await testUtils.saveItemAndMembership({ member: creator }));
    await saveItemLoginSchema({ item: item as unknown as DiscriminatedItem });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearDatabase(app.db);
  });

  afterAll(async () => {
    app.close();
  });

  describe('Create Enroll', () => {
    it('returns valid object when successful', async () => {
      mockAuthenticate(member);

      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${item.id}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.OK);
      const itemMembership = await response.json();
      expectItemMembershipToBe(itemMembership, member, item);
    });
    it('rejects when unauthenticated', async () => {
      unmockAuthenticate();
      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${item.id}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
    it('rejects when unauthenticated with non-existing item id', async () => {
      unmockAuthenticate();
      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${uuid()}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED);
    });
    it('rejects when item does not exist', async () => {
      mockAuthenticate(member);

      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${uuid()}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND);
    });
    it('accepts when authenticated as the creator when there is no membership', async () => {
      const { itemMembershipRepository } = buildRepositories();
      await itemMembershipRepository.delete({ item, account: creator });
      mockAuthenticate(creator);

      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${item.id}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.OK);
      const itemMembership = await response.json();
      expectItemMembershipToBe(itemMembership, creator, item);
    });
    it('rejects when authenticated as the creator with membership', async () => {
      mockAuthenticate(creator);

      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${item.id}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });
    it('rejects when already have a membership', async () => {
      await testUtils.saveMembership({
        item,
        account: member,
      });
      mockAuthenticate(member);

      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${item.id}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST);
    });

    it('rejects when there is no item login schema', async () => {
      const { item: anotherItem } = await testUtils.saveItemAndMembership({ member: creator });
      mockAuthenticate(member);

      const response = await app.inject({
        method: HttpMethod.Post,
        url: `/items/${anotherItem.id}/enroll`,
      });

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN);
    });
  });
});
