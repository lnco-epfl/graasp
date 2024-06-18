import { FastifyPluginAsync } from 'fastify';

import { ItemType } from '@graasp/sdk';

import { Repositories } from '../../../../utils/repositories.js';
import { isAuthenticated } from '../../../auth/plugins/passport/index.js';
import { Actor } from '../../../member/entities/member.js';
import { Item } from '../../entities/Item.js';
import { LinkQueryParameterIsRequired } from './errors.js';
import { createSchema, getLinkMetadata, updateExtraSchema } from './schemas.js';
import { EmbeddedLinkService } from './service.js';
import { ensureProtocol } from './utils.js';

interface GraaspEmbeddedLinkItemOptions {
  /** \<protocol\>://\<hostname\>:\<port\> */
  iframelyHrefOrigin: string;
}

const plugin: FastifyPluginAsync<GraaspEmbeddedLinkItemOptions> = async (fastify, options) => {
  const { iframelyHrefOrigin } = options;
  const {
    log,
    items: { extendCreateSchema, extendExtrasUpdateSchema, service: itemService },
  } = fastify;
  const embeddedLinkService = new EmbeddedLinkService();

  if (!iframelyHrefOrigin) {
    throw new Error('graasp-embedded-link-item: mandatory options missing');
  }
  // "install" custom schema for validating embedded link items creation
  extendCreateSchema(createSchema);
  // add link extra update schema that allows to update url
  extendExtrasUpdateSchema(updateExtraSchema);

  fastify.get<{ Querystring: { link: string } }>(
    '/metadata',
    { preHandler: isAuthenticated, schema: getLinkMetadata },
    async ({ query: { link } }) => {
      if (!link) {
        throw new LinkQueryParameterIsRequired();
      }

      const url = ensureProtocol(link);
      const metadata = await embeddedLinkService.getLinkMetadata(iframelyHrefOrigin, url);
      const isEmbeddingAllowed = await embeddedLinkService.checkEmbeddingAllowed(url, log);

      return {
        ...metadata,
        isEmbeddingAllowed,
      };
    },
  );

  // register pre create handler to pre fetch link metadata
  const hook = async (
    actor: Actor,
    repositories: Repositories,
    { item }: { item: Partial<Item> },
  ) => {
    // if the extra is undefined or it does not contain the embedded link extra key, exit
    if (!item.extra || !(ItemType.LINK in item.extra)) {
      return;
    }
    const { embeddedLink } = item.extra;

    const { url } = embeddedLink;
    const { title, description, html, thumbnails, icons } =
      await embeddedLinkService.getLinkMetadata(iframelyHrefOrigin, url);

    // TODO: maybe all the code below should be moved to another place if it gets more complex
    if (title) {
      item.name = title;
    }
    if (description) {
      embeddedLink.description = description;
    }
    if (html) {
      embeddedLink.html = html;
    }

    embeddedLink.thumbnails = thumbnails;
    embeddedLink.icons = icons;

    // default settings
    item.settings = {
      showLinkButton: true,
      showLinkIframe: false,
      ...(item.settings ?? {}),
    };
  };

  itemService.hooks.setPreHook('create', hook);
  itemService.hooks.setPreHook('update', hook);
};

export default plugin;
