import { singleton } from 'tsyringe';

import {
  ClientHostManager,
  Context,
  PermissionLevel,
  ShortLinkPatchPayload,
  ShortLinkPlatform,
  ShortLinkPostPayload,
} from '@graasp/sdk';

import { ITEMS_ROUTE_PREFIX } from '../../../../utils/config';
import { UnauthorizedMember } from '../../../../utils/errors';
import { Repositories } from '../../../../utils/repositories';
import { Account } from '../../../account/entities/account';
import { ItemService } from '../../../item/service';
import { Member } from '../../../member/entities/member';
import { ItemPublishedNotFound } from '../publication/published/errors';
import { ItemPublishedService } from '../publication/published/service';

export const SHORT_LINKS_ROUTE_PREFIX = '/short-links';
export const SHORT_LINKS_LIST_ROUTE = '/list';
export const SHORT_LINKS_FULL_PREFIX = `${ITEMS_ROUTE_PREFIX}${SHORT_LINKS_ROUTE_PREFIX}`;

@singleton()
export class ShortLinkService {
  private itemService: ItemService;
  private itemPublishedService: ItemPublishedService;

  public constructor(itemService: ItemService, itemPublishedService: ItemPublishedService) {
    this.itemService = itemService;
    this.itemPublishedService = itemPublishedService;
  }

  async post(member: Member, repositories: Repositories, shortLink: ShortLinkPostPayload) {
    const { shortLinkRepository } = repositories;

    // check that the item is published if platform is Library
    if (shortLink.platform === ShortLinkPlatform.Library) {
      // Will throw exception if not published or not tagged.
      // Rethrow an ItemPublishedNotFound to indicate that we try
      // to create a short links to the library on an unpublished item.
      try {
        await this.itemPublishedService.get(member, repositories, shortLink.itemId);
      } catch (ex) {
        throw new ItemPublishedNotFound();
      }
    }

    // check that the member can admin the item to be allowed to create short link
    await this.itemService.get(member, repositories, shortLink.itemId, PermissionLevel.Admin);

    return shortLinkRepository.addOne(shortLink);
  }

  async getOne(repositories: Repositories, alias: string) {
    const { shortLinkRepository } = repositories;
    return shortLinkRepository.getOne(alias);
  }

  async getOneWithoutJoin(repositories: Repositories, alias: string) {
    const { shortLinkRepository } = repositories;
    return shortLinkRepository.getOneFlat(alias);
  }

  async getAllForItem(account: Account, repositories: Repositories, itemId: string) {
    const { shortLinkRepository } = repositories;

    if (!account) throw new UnauthorizedMember();
    // check that the member can read the item to be allowed to read all short links
    await this.itemService.get(account, repositories, itemId, PermissionLevel.Read);

    return shortLinkRepository.getByItem(itemId);
  }

  async getRedirection(repositories: Repositories, alias: string) {
    const shortLink = await this.getOne(repositories, alias);
    const clientHostManager = ClientHostManager.getInstance();

    return clientHostManager.getItemLink(shortLink.platform as Context, shortLink.item.id);
  }

  async delete(member: Member, repositories: Repositories, alias: string) {
    const { shortLinkRepository } = repositories;

    if (!member) throw new UnauthorizedMember();
    const shortLink = await shortLinkRepository.getOne(alias);

    // check that the member can admin the item to be allowed to create short link
    await this.itemService.get(member, repositories, shortLink.item.id, PermissionLevel.Admin);

    await shortLinkRepository.deleteOne(alias);
    return shortLink;
  }

  async update(
    member: Member,
    repositories: Repositories,
    alias: string,
    updatedShortLink: ShortLinkPatchPayload,
  ) {
    const { shortLinkRepository } = repositories;
    if (!member) {
      throw new UnauthorizedMember();
    }
    const shortLink = await shortLinkRepository.getOne(alias);

    // check that the member can admin the item to be allowed to create short link
    await this.itemService.get(member, repositories, shortLink.item.id, PermissionLevel.Admin);

    return shortLinkRepository.updateOne(alias, updatedShortLink);
  }
}

export default ShortLinkService;
