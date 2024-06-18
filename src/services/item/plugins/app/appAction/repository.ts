import { In } from 'typeorm';

import { ResultOf } from '@graasp/sdk';

import { AppDataSource } from '../../../../../plugins/datasource.js';
import { MemberIdentifierNotFound } from '../../../../itemLogin/errors.js';
import { appActionSchema } from '../../../../member/plugins/export-data/schemas/schemas.js';
import { schemaToSelectMapper } from '../../../../member/plugins/export-data/utils/selection.utils';
import { mapById } from '../../../../utils.js';
import { ManyItemsGetFilter, SingleItemGetFilter } from '../interfaces/request.js';
import { AppAction } from './appAction.js';
import { InputAppAction } from './interfaces/app-action.js';

export const AppActionRepository = AppDataSource.getRepository(AppAction).extend({
  async post(itemId: string, memberId: string, body: Partial<InputAppAction>): Promise<AppAction> {
    const created = await this.insert({
      ...body,
      item: { id: itemId },
      member: { id: memberId },
    });

    // TODO: better solution?
    // query builder returns creator as id and extra as string
    return this.get(created.identifiers[0].id);
  },

  patch(itemId: string, appActionId: string, body: Partial<AppAction>): Promise<void> {
    return this.createQueryBuilder('appAction').update({ id: appActionId, itemId }, body);
  },

  deleteOne(itemId: string, appActionId: string): Promise<void> {
    return this.delete(appActionId);
  },

  async get(id: string): Promise<AppAction | null> {
    return this.findOne({ where: { id }, relations: { member: true } });
  },

  getForItem(itemId: string, filters: SingleItemGetFilter): Promise<AppAction[]> {
    const { memberId } = filters;
    return this.find({
      where: { item: { id: itemId }, member: { id: memberId } },
      relations: { member: true },
    });
  },

  /**
   * Return all the app actions generated by the given member.
   * @param memberId ID of the member to retrieve the data.
   * @returns an array of app actions generated by the member.
   */
  getForMemberExport(memberId: string): Promise<AppAction[]> {
    if (!memberId) {
      throw new MemberIdentifierNotFound();
    }

    return this.find({
      select: schemaToSelectMapper(appActionSchema),
      where: { member: { id: memberId } },
      order: { createdAt: 'DESC' },
      relations: {
        item: true,
      },
    });
  },

  async getForManyItems(
    itemIds: string[],
    filters: ManyItemsGetFilter,
  ): Promise<ResultOf<AppAction[]>> {
    const { memberId } = filters;

    // here it is ok to have some app actions where the item or the member are null (because of missing or soft-deleted relations)
    const appActions = await this.find({
      where: { item: { id: In(itemIds) }, member: { id: memberId } },
      relations: { item: true, member: true },
    });
    // todo: should use something like:
    // but this does not work. Maybe related to the placement of the IN ?
    // const appActions = await this.createQueryBuilder('actions')
    //   .innerJoinAndSelect('actions.item', 'item', 'actions.item IN (:...itemIds)', { itemIds })
    //   .innerJoinAndSelect('actions.member', 'member', 'actions.member = :memberId', { memberId })
    //   .getMany();
    return mapById({
      keys: itemIds,
      findElement: (id) => appActions.filter(({ item }) => item.id === id),
    });
  },
});
