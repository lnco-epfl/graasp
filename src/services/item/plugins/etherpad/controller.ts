import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { resolveDependency } from '../../../../di/utils';
import { asDefined } from '../../../../utils/assertions';
import { isAuthenticated } from '../../../auth/plugins/passport';
import { matchOne } from '../../../authorization';
import { assertIsMember } from '../../../member/entities/member';
import { validatedMemberAccountRole } from '../../../member/strategies/validatedMemberAccountRole';
import { ItemService } from '../../service';
import { createEtherpad, getEtherpadFromItem } from './schemas';
import { EtherpadItemService } from './service';

const endpoints: FastifyPluginAsyncTypebox = async (fastify) => {
  const itemService = resolveDependency(ItemService);
  const etherpadItemService = resolveDependency(EtherpadItemService);

  /**
   * Etherpad creation
   */
  fastify.post(
    '/create',
    {
      schema: createEtherpad,
      preHandler: [isAuthenticated, matchOne(validatedMemberAccountRole)],
    },
    async (request) => {
      const {
        user,
        query: { parentId },
        body: { name },
      } = request;
      const member = asDefined(user?.account);
      assertIsMember(member);
      return await etherpadItemService.createEtherpadItem(member, name, parentId);
    },
  );

  /**
   * Etherpad view in given mode (read or write)
   * Access should be granted if and only if the user has at least write
   * access to the item. If user only has read permission, then the pad
   * should be displayed in read-only mode
   */
  fastify.get(
    '/view/:itemId',
    { schema: getEtherpadFromItem, preHandler: isAuthenticated },
    async (request, reply) => {
      const {
        user,
        params: { itemId },
        query: { mode = 'read' },
      } = request;
      const member = asDefined(user?.account);

      const { cookie, padUrl } = await etherpadItemService.getEtherpadFromItem(
        member,
        itemId,
        mode,
      );

      reply.setCookie(cookie.name, cookie.value, cookie.options);
      return { padUrl };
    },
  );

  /**
   * Delete etherpad on item delete
   */
  itemService.hooks.setPreHook('delete', async (actor, repositories, { item }) => {
    if (!actor) {
      return;
    }
    await etherpadItemService.deleteEtherpadForItem(item);
  });

  /**
   * Copy etherpad on item copy
   */
  itemService.hooks.setPreHook('copy', async (actor, repositories, { original: item }) => {
    if (!actor) {
      return;
    }
    await etherpadItemService.copyEtherpadInMutableItem(item);
  });
};

const plugin: FastifyPluginAsync = async (fastify) => {
  // create a route prefix for etherpad
  await fastify.register(endpoints, { prefix: 'etherpad' });
};

export default fp(plugin, {
  name: 'graasp-plugin-etherpad',
});