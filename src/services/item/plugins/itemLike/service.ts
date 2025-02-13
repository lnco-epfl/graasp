import { singleton } from 'tsyringe';

import { Repositories } from '../../../../utils/repositories';
import { filterOutPackedItems } from '../../../authorization';
import { ItemService } from '../../../item/service';
import { Actor, Member } from '../../../member/entities/member';

@singleton()
export class ItemLikeService {
  private itemService: ItemService;

  constructor(itemService: ItemService) {
    this.itemService = itemService;
  }

  async getForMember(member: Member, repositories: Repositories) {
    const { itemLikeRepository } = repositories;

    // only own items
    // TODO: allow to get other's like?

    const likes = await itemLikeRepository.getByCreator(member.id);
    // filter out items user might not have access to
    // and packed item
    const filteredItems = await filterOutPackedItems(
      member,
      repositories,
      likes.map(({ item }) => item),
    );
    return filteredItems.map((item) => {
      const like = likes.find(({ item: i }) => i.id === item.id);
      return { ...like, item };
    });
  }

  async getForItem(actor: Actor, repositories: Repositories, itemId: string) {
    const { itemLikeRepository } = repositories;

    await this.itemService.get(actor, repositories, itemId);

    return itemLikeRepository.getByItemId(itemId);
  }

  async removeOne(member: Member, repositories: Repositories, itemId: string) {
    const { itemLikeRepository } = repositories;

    // QUESTION: allow public to be liked?
    const item = await this.itemService.get(member, repositories, itemId);

    const result = await itemLikeRepository.deleteOneByCreatorAndItem(member.id, item.id);

    return result;
  }

  async post(member: Member, repositories: Repositories, itemId: string) {
    const { itemLikeRepository } = repositories;

    // QUESTION: allow public to be liked?
    const item = await this.itemService.get(member, repositories, itemId);
    const result = await itemLikeRepository.addOne({ creatorId: member.id, itemId: item.id });

    return result;
  }
}
