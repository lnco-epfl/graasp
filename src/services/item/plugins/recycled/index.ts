import { StatusCodes } from 'http-status-codes';

import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { resolveDependency } from '../../../../di/utils';
import { asDefined } from '../../../../utils/assertions';
import { buildRepositories } from '../../../../utils/repositories';
import { isAuthenticated } from '../../../auth/plugins/passport';
import { matchOne } from '../../../authorization';
import { assertIsMember } from '../../../member/entities/member';
import { memberAccountRole } from '../../../member/strategies/memberAccountRole';
import { validatedMemberAccountRole } from '../../../member/strategies/validatedMemberAccountRole';
import { ItemOpFeedbackErrorEvent, ItemOpFeedbackEvent, memberItemsTopic } from '../../ws/events';
import { getRecycledItemDatas, recycleOrRestoreMany } from './schemas';
import { RecycledBinService } from './service';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { db, websockets } = fastify;

  const recycleBinService = resolveDependency(RecycledBinService);

  // Note: it's okay to not prevent memberships changes on recycled items
  // it is not really possible to change them in the interface
  // but it won't break anything

  // API endpoints

  // get own recycled items data
  fastify.get(
    '/recycled',
    { schema: getRecycledItemDatas, preHandler: [isAuthenticated, matchOne(memberAccountRole)] },
    async ({ user }) => {
      const member = asDefined(user?.account);
      assertIsMember(member);
      const result = await recycleBinService.getAll(member, buildRepositories());
      return result;
    },
  );

  // recycle multiple items
  fastify.post(
    '/recycle',
    {
      schema: recycleOrRestoreMany,
      preHandler: [isAuthenticated, matchOne(validatedMemberAccountRole)],
    },
    async (request, reply) => {
      const {
        query: { id: ids },
        log,
        user,
      } = request;
      const member = asDefined(user?.account);
      assertIsMember(member);
      db.transaction(async (manager) => {
        const items = await recycleBinService.recycleMany(member, buildRepositories(manager), ids);
        websockets.publish(
          memberItemsTopic,
          member.id,
          ItemOpFeedbackEvent('recycle', ids, items.data, items.errors),
        );
        return items;
      }).catch((e: Error) => {
        log.error(e);
        websockets.publish(
          memberItemsTopic,
          member.id,
          ItemOpFeedbackErrorEvent('recycle', ids, e),
        );
      });

      reply.status(StatusCodes.ACCEPTED);
      return ids;
    },
  );

  // restore multiple items
  fastify.post(
    '/restore',
    {
      schema: recycleOrRestoreMany,
      preHandler: [isAuthenticated, matchOne(validatedMemberAccountRole)],
    },
    async (request, reply) => {
      const {
        query: { id: ids },
        log,
        user,
      } = request;
      const member = asDefined(user?.account);
      assertIsMember(member);
      log.info(`Restoring items ${ids}`);

      db.transaction(async (manager) => {
        const items = await recycleBinService.restoreMany(member, buildRepositories(manager), ids);
        websockets.publish(
          memberItemsTopic,
          member.id,
          ItemOpFeedbackEvent('restore', ids, items.data, items.errors),
        );
      }).catch((e: Error) => {
        log.error(e);
        websockets.publish(
          memberItemsTopic,
          member.id,
          ItemOpFeedbackErrorEvent('restore', ids, e),
        );
      });
      reply.status(StatusCodes.ACCEPTED);
      return ids;
    },
  );
};

export default plugin;
