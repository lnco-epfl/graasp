import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';

import { ItemType } from '@graasp/sdk';

import { resolveDependency } from '../../../../../di/utils';
import { asDefined } from '../../../../../utils/assertions';
import { Repositories, buildRepositories } from '../../../../../utils/repositories';
import { authenticateAppsJWT } from '../../../../auth/plugins/passport';
import { matchOne } from '../../../../authorization';
import { Actor, assertIsMember } from '../../../../member/entities/member';
import { validatedMemberAccountRole } from '../../../../member/strategies/validatedMemberAccountRole';
import { Item } from '../../../entities/Item';
import { ItemService } from '../../../service';
import { appSettingsWsHooks } from '../ws/hooks';
import appSettingFilePlugin from './plugins/file';
import { create, deleteOne, getForOne, updateOne } from './schemas';
import { AppSettingService } from './service';

const plugin: FastifyPluginAsyncTypebox = async (fastify) => {
  const { db } = fastify;

  const itemService = resolveDependency(ItemService);
  const appSettingService = resolveDependency(AppSettingService);

  fastify.register(appSettingsWsHooks, { appSettingService });

  // copy app settings and related files on item copy
  const hook = async (
    actor: Actor,
    repositories: Repositories,
    { original, copy }: { original: Item; copy: Item },
  ) => {
    if (original.type !== ItemType.APP || copy.type !== ItemType.APP) return;

    await appSettingService.copyForItem(actor, repositories, original, copy);
  };
  itemService.hooks.setPostHook('copy', hook);

  fastify.register(appSettingFilePlugin, { appSettingService });

  // create app setting
  fastify.post(
    '/:itemId/app-settings',
    {
      schema: create,
      preHandler: [authenticateAppsJWT, matchOne(validatedMemberAccountRole)],
    },
    async ({ user, params: { itemId }, body }) => {
      const member = asDefined(user?.account);
      assertIsMember(member);
      return db.transaction(async (manager) => {
        return appSettingService.post(member, buildRepositories(manager), itemId, body);
      });
    },
  );

  // update app setting
  fastify.patch(
    '/:itemId/app-settings/:id',
    {
      schema: updateOne,
      preHandler: [authenticateAppsJWT, matchOne(validatedMemberAccountRole)],
    },
    async ({ user, params: { itemId, id: appSettingId }, body }) => {
      const member = asDefined(user?.account);
      assertIsMember(member);
      return db.transaction(async (manager) => {
        return appSettingService.patch(
          member,
          buildRepositories(manager),
          itemId,
          appSettingId,
          body,
        );
      });
    },
  );

  // delete app setting
  fastify.delete(
    '/:itemId/app-settings/:id',
    {
      schema: deleteOne,
      preHandler: [authenticateAppsJWT, matchOne(validatedMemberAccountRole)],
    },
    async ({ user, params: { itemId, id: appSettingId } }) => {
      const member = asDefined(user?.account);
      assertIsMember(member);
      return db.transaction(async (manager) => {
        return appSettingService.deleteOne(
          member,
          buildRepositories(manager),
          itemId,
          appSettingId,
        );
      });
    },
  );

  // get app settings
  fastify.get<{ Params: { itemId: string }; Querystring: { name?: string } }>(
    '/:itemId/app-settings',
    { schema: getForOne, preHandler: authenticateAppsJWT },
    async ({ user, params: { itemId }, query: { name } }) => {
      return appSettingService.getForItem(user?.account, buildRepositories(), itemId, name);
    },
  );
};

export default plugin;
