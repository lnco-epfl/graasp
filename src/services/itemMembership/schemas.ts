import { Type } from '@sinclair/typebox';
import { StatusCodes } from 'http-status-codes';

import { PermissionLevel } from '@graasp/sdk';

import { customType } from '../../plugins/typebox';
import { UUID_REGEX, entityIdSchemaRef, errorSchemaRef } from '../../schemas/global';
import { augmentedAccountSchemaRef } from '../account/schemas';
import { itemSchemaRef } from '../item/schema';

export default {
  $id: 'https://graasp.org/item-memberships/',
  definitions: {
    // permission values
    permission: {
      type: 'string',
      enum: [PermissionLevel.Read, PermissionLevel.Write, PermissionLevel.Admin],
    },

    // item membership properties to be returned to the client
    itemMembership: {
      type: 'object',
      properties: {
        id: customType.UUID(),
        account: augmentedAccountSchemaRef,
        /**
         * itemPath's 'pattern' not supported in serialization.
         * since 'itemMembership' schema is only used for serialization it's safe
         * to just use `{ type: 'string' }`
         */
        // itemPath: { $ref: 'https://graasp.org/#/definitions/itemPath' },
        // bug: cannot set item schema because it's a fluent schema
        item: itemSchemaRef,
        // TODO: bug! should allow relative $ref: #/definitions/permission
        // check: https://github.com/fastify/fastify/issues/2328
        permission: { $ref: 'https://graasp.org/item-memberships/#/definitions/permission' },
        creator: { $ref: 'https://graasp.org/members/#/definitions/member' },
        createdAt: { type: 'string' },
        updatedAt: { type: 'string' },
      },
      additionalProperties: false,
    },

    // item membership properties required at creation
    createPartialItemMembership: {
      type: 'object',
      required: ['accountId', 'permission'],
      properties: {
        accountId: customType.UUID(),
        permission: { $ref: '#/definitions/permission' },
      },
      additionalProperties: false,
    },

    // item membership properties that can be modified after creation
    updatePartialItemMembership: {
      type: 'object',
      required: ['permission'],
      properties: {
        permission: { $ref: '#/definitions/permission' },
      },
      additionalProperties: false,
    },
  },
};

// schema for creating an item membership
const create = {
  querystring: {
    type: 'object',
    required: ['itemId'],
    properties: {
      itemId: customType.UUID(),
    },
    additionalProperties: false,
  },
  body: { $ref: 'https://graasp.org/item-memberships/#/definitions/createPartialItemMembership' },
  response: {
    [StatusCodes.OK]: { $ref: 'https://graasp.org/item-memberships/#/definitions/itemMembership' },
  },
};

// schema for creating many item memberships
const createMany = {
  params: {
    type: 'object',
    required: ['itemId'],
    properties: {
      itemId: customType.UUID(),
    },
    additionalProperties: false,
  },
  body: {
    type: 'object',
    properties: {
      memberships: {
        type: 'array',
        items: {
          $ref: 'https://graasp.org/item-memberships/#/definitions/createPartialItemMembership',
        },
      },
    },
  },
  response: {
    202: {},
  },
};

// schema for getting many item's memberships
const getItems = {
  querystring: {
    type: 'object',
    required: ['itemId'],
    properties: {
      itemId: {
        type: 'array',
        items: customType.UUID(),
      },
    },

    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      // additionalProperties:true,
      properties: {
        data: {
          type: 'object',
          patternProperties: {
            [UUID_REGEX]: {
              type: 'array',
              items: {
                $ref: 'https://graasp.org/item-memberships/#/definitions/itemMembership',
              },
            },
          },
        },
        errors: Type.Array(errorSchemaRef),
      },
    },
  },
};

// schema for updating an item membership
const updateOne = {
  params: entityIdSchemaRef,
  body: { $ref: 'https://graasp.org/item-memberships/#/definitions/updatePartialItemMembership' },
  response: {
    200: { $ref: 'https://graasp.org/item-memberships/#/definitions/itemMembership' },
  },
};

// schema for deleting an item membership
const deleteOne = {
  params: entityIdSchemaRef,
  querystring: {
    type: 'object',
    properties: {
      purgeBelow: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  response: {
    200: { $ref: 'https://graasp.org/item-memberships/#/definitions/itemMembership' },
  },
};

// schema for deleting all item's tree item memberships
const deleteAll = {
  querystring: {
    type: 'object',
    required: ['itemId'],
    properties: {
      itemId: customType.UUID(),
    },
    additionalProperties: false,
  },
};

export { getItems, create, createMany, updateOne, deleteOne, deleteAll };
