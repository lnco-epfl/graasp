import { mkdirSync } from 'fs';
import path from 'path';
import { singleton } from 'tsyringe';

import { ItemValidationStatus, PermissionLevel, UUID } from '@graasp/sdk';

import { BaseLogger } from '../../../../../logger';
import { TMP_FOLDER } from '../../../../../utils/config';
import { Repositories } from '../../../../../utils/repositories';
import { validatePermission } from '../../../../authorization';
import { Member } from '../../../../member/entities/member';
import { FolderItem, Item } from '../../../entities/Item';
import { ItemPublishedService } from '../published/service';
import { ItemValidationModerator } from './moderators/itemValidationModerator';
import { ValidationQueue } from './validationQueue';

@singleton()
export class ItemValidationService {
  private readonly itemPublishedService: ItemPublishedService;
  private readonly contentModerator: ItemValidationModerator;
  private readonly validationQueue: ValidationQueue;
  private readonly logger: BaseLogger;

  constructor(
    itemPublishedService: ItemPublishedService,
    contentModerator: ItemValidationModerator,
    validationQueue: ValidationQueue,
    logger: BaseLogger,
  ) {
    this.itemPublishedService = itemPublishedService;
    this.contentModerator = contentModerator;
    this.validationQueue = validationQueue;
    this.logger = logger;
  }

  buildStoragePath(itemValidationId: UUID) {
    const p = path.join(TMP_FOLDER, 'validation', itemValidationId);
    mkdirSync(p, { recursive: true });
    return p;
  }

  async getLastItemValidationGroupForItem(member: Member, repositories: Repositories, item: Item) {
    const { itemValidationGroupRepository } = repositories;

    const group = await itemValidationGroupRepository.getLastForItem(item.id);

    // check permissions
    await validatePermission(repositories, PermissionLevel.Admin, member, item);

    return group;
  }

  async getItemValidationGroup(
    member: Member,
    repositories: Repositories,
    itemValidationGroupId: string,
  ) {
    const { itemValidationGroupRepository } = repositories;

    const group = await itemValidationGroupRepository.get(itemValidationGroupId);

    await validatePermission(repositories, PermissionLevel.Admin, member, group.item);

    return group;
  }

  async post(repositories: Repositories, item: FolderItem, onValidationStarted?: () => void) {
    const { itemValidationGroupRepository, itemRepository } = repositories;

    const descendants = await itemRepository.getDescendants(item);

    // create record in item-validation
    const iVG = await itemValidationGroupRepository.post(item.id);

    // indicates that the item's validation is pending
    await this.validationQueue.addInProgress(item.id);
    // Indicates the caller that the validation will start.
    // It can be usefull if we want to refetch on the frontend to display the pending status.
    onValidationStarted?.();

    const items = [item, ...descendants];

    const results = await Promise.all(
      items.map(async (currItem) => {
        try {
          const validationResults = await this.contentModerator.validate(
            repositories,
            currItem,
            iVG,
          );
          return validationResults.every((v) => v === ItemValidationStatus.Success);
        } catch (e) {
          this.logger.error(e);
        }
        return false;
      }),
    );

    await this.validationQueue.removeInProgress(item.id);

    const operationResult = results.every((v) => v);

    return operationResult;
  }
}
