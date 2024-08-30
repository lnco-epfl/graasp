import { FastifyPluginAsync } from 'fastify';

import { ItemLoginSchemaType, ItemTagType, PermissionLevel } from '@graasp/sdk';

import { resolveDependency } from '../../di/utils';
import { notUndefined } from '../../utils/assertions';
import { ItemNotFound } from '../../utils/errors';
import { buildRepositories } from '../../utils/repositories';
import { SESSION_KEY, isAuthenticated, optionalIsAuthenticated } from '../auth/plugins/passport';
import { matchOne } from '../authorization';
import { ItemTagService } from '../item/plugins/itemTag/service';
import { ItemService } from '../item/service';
import { ItemMembershipService } from '../itemMembership/service';
import { assertIsMember } from '../member/entities/member';
import { validatedMemberAccountRole } from '../member/strategies/validatedMemberAccountRole';
import { ItemLoginSchemaNotFound, ValidMemberSession } from './errors';
import { ItemLoginMemberCredentials } from './interfaces/item-login';
import {
  deleteLoginSchema,
  getLoginSchema,
  getLoginSchemaType,
  login,
  updateLoginSchema,
} from './schemas';
import { ItemLoginService } from './service';

const plugin: FastifyPluginAsync = async (fastify) => {
  const { db } = fastify;

  const itemService = resolveDependency(ItemService);
  const itemLoginService = new ItemLoginService(fastify, itemService);
  const itemTagService = resolveDependency(ItemTagService);
  const itemMembershipService = resolveDependency(ItemMembershipService);

  // get login schema type for item
  // used to trigger item login for student
  // public endpoint
  fastify.get<{ Params: { id: string } }>(
    '/:id/login-schema-type',
    { schema: getLoginSchemaType, preHandler: optionalIsAuthenticated },
    async ({ user, params: { id: itemId } }) => {
      return await db.transaction(async (manager) => {
        const repositories = buildRepositories(manager);
        const item = await itemService.get(
          user?.account,
          repositories,
          itemId,
          PermissionLevel.Read,
          false,
        );

        const tags = await itemTagService.getByItemPath(repositories, item.path);
        const isHidden = Boolean(tags.find((t) => t.type === ItemTagType.Hidden));
        if (
          isHidden &&
          (user?.account == undefined ||
            !(await itemMembershipService.getByAccountAndItem(
              repositories,
              user?.account?.id,
              item.id,
            )))
        ) {
          throw new ItemNotFound(itemId);
        }

        const itemLoginSchema = await itemLoginService.getByItemPath(repositories, item.path);

        return itemLoginSchema?.type;
      });
    },
  );

  // get login schema for item
  fastify.get<{ Params: { id: string } }>(
    '/:id/login-schema',
    {
      schema: getLoginSchema,
      preHandler: isAuthenticated,
    },
    async ({ user, params: { id: itemId } }) => {
      return await db.transaction(async (manager) => {
        const repositories = buildRepositories(manager);
        const item = await itemService.get(
          user?.account,
          repositories,
          itemId,
          PermissionLevel.Admin,
        );
        const itemLoginSchema = await itemLoginService.getByItemPath(repositories, item.path);
        if (!itemLoginSchema) {
          throw new ItemLoginSchemaNotFound({ itemId });
        }
        return itemLoginSchema;
      });
    },
  );

  // TODO: MOBILE
  // log in to item
  fastify.post<{
    Params: { id: string };
    Querystring: { m: boolean };
    Body: ItemLoginMemberCredentials;
  }>(
    '/:id/login',
    {
      schema: login,
      // set member in request if exists without throwing
      preHandler: optionalIsAuthenticated,
    },
    async ({ body, user, session, params }) => {
      // if there's already a valid session, fail immediately
      if (user?.account) {
        throw new ValidMemberSession(user?.account);
      }
      return db.transaction(async (manager) => {
        const bondMember = await itemLoginService.login(
          buildRepositories(manager),
          params.id,
          body,
        );
        // set session
        session.set(SESSION_KEY, bondMember.id);
        return bondMember;
      });
    },
  );

  fastify.put<{ Params: { id: string }; Body: { type: ItemLoginSchemaType } }>(
    '/:id/login-schema',
    {
      schema: updateLoginSchema,

      // set member in request - throws if does not exist
      preHandler: [isAuthenticated, matchOne(validatedMemberAccountRole)],
    },
    async ({ user, params: { id: itemId }, body: { type } }) => {
      const member = notUndefined(user?.account);
      assertIsMember(member);
      return db.transaction(async (manager) => {
        return itemLoginService.put(member, buildRepositories(manager), itemId, type);
      });
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/:id/login-schema',
    {
      schema: deleteLoginSchema,

      // set member in request - throws if does not exist
      preHandler: [isAuthenticated, matchOne(validatedMemberAccountRole)],
    },
    async ({ user, params: { id: itemId } }) => {
      return db.transaction(async (manager) => {
        const member = notUndefined(user?.account);
        assertIsMember(member);
        return itemLoginService.delete(member, buildRepositories(manager), itemId);
      });
    },
  );
};

export default plugin;
