import { FastifyInstance } from 'fastify';

import { PermissionLevel } from '@graasp/sdk';

import build, { clearDatabase } from '../../../../../../test/app';
import { AppDataSource } from '../../../../../plugins/datasource';
import { Action } from '../../../../action/entities/action';
import { ActionRepository } from '../../../../action/repositories/action';
import { saveActions } from '../../../../action/test/fixtures/actions';
import { ChatMessage } from '../../../../chat/chatMessage';
import { ChatMention } from '../../../../chat/plugins/mentions/chatMention';
import { ChatMentionRepository } from '../../../../chat/plugins/mentions/repository';
import { ChatMessageRepository } from '../../../../chat/repository';
import { saveChatMessages } from '../../../../chat/test/fixtures';
import { AppActionRepository } from '../../../../item/plugins/app/appAction/repository';
import { saveAppActions } from '../../../../item/plugins/app/appAction/test/fixtures';
import { AppDataRepository } from '../../../../item/plugins/app/appData/repository';
import { saveAppData } from '../../../../item/plugins/app/appData/test/fixtures';
import { AppSettingRepository } from '../../../../item/plugins/app/appSetting/repository';
import { saveAppSettings } from '../../../../item/plugins/app/appSetting/test/fixtures';
import { FavoriteRepository } from '../../../../item/plugins/itemFavorite/repositories/favorite';
import { saveItemFavorites } from '../../../../item/plugins/itemFavorite/test/fixtures';
import { ItemLikeRepository } from '../../../../item/plugins/itemLike/repository';
import { saveItemLikes } from '../../../../item/plugins/itemLike/test/utils';
import { ItemRepository } from '../../../../item/repository';
import { ItemTestUtils } from '../../../../item/test/fixtures/items';
import { ItemMembership } from '../../../../itemMembership/entities/ItemMembership';
import { ItemMembershipRepository } from '../../../../itemMembership/repository';
import { saveMember } from '../../../test/fixtures/members';
import {
  actionSchema,
  appActionSchema,
  appDataSchema,
  appSettingSchema,
  itemFavoriteSchema,
  itemLikeSchema,
  itemMembershipSchema,
  itemSchema,
  messageMentionSchema,
  messageSchema,
} from '../schemas/schemas';
import { expectNoLeaksAndEquality } from './fixtures';

/**
 * The repository tests ensure that no unwanted columns are leaked during the export.
 */

const itemTestUtils = new ItemTestUtils();

describe('DataMember Export', () => {
  let app: FastifyInstance;
  let exportingActor;
  let randomUser;
  let item;
  let itemOfRandomUser;

  beforeEach(async () => {
    ({ app, actor: exportingActor } = await build());
    randomUser = await saveMember();

    item = await itemTestUtils.saveItem({ actor: exportingActor });
    itemOfRandomUser = await itemTestUtils.saveItem({ actor: randomUser });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await clearDatabase(app.db);
    exportingActor = null;
    randomUser = null;
    item = null;
    app.close();
  });

  describe('Actions', () => {
    const rawActionRepository = AppDataSource.getRepository(Action);

    it('get all Actions for the member', async () => {
      // save for exporting actor
      const actions = await saveActions(rawActionRepository, [
        { item, account: exportingActor },
        { item, account: exportingActor },
        { item, account: exportingActor },
      ]);
      // on item of random user
      const otherActions = await saveActions(rawActionRepository, [
        { item: itemOfRandomUser, account: exportingActor },
        { item: itemOfRandomUser, account: exportingActor },
        { item: itemOfRandomUser, account: exportingActor },
      ]);

      // noise: save for a random user
      await saveActions(rawActionRepository, [{ item, account: randomUser }]);
      await saveActions(rawActionRepository, [{ item: itemOfRandomUser, account: randomUser }]);

      const results = await new ActionRepository().getForAccountExport(exportingActor.id);
      expectNoLeaksAndEquality(results, [...actions, ...otherActions], actionSchema);
    });
  });

  describe('AppActions', () => {
    it('get all AppActions for the member', async () => {
      // save for exporting actor
      const appActions = await saveAppActions({ item, member: exportingActor });
      // on item of random user
      const otherActions = await saveAppActions({
        item: itemOfRandomUser,
        member: exportingActor,
      });

      // noise: for a random member
      await saveAppActions({ item, member: randomUser });
      await saveAppActions({ item: itemOfRandomUser, member: randomUser });

      const results = await new AppActionRepository().getForMemberExport(exportingActor.id);
      expectNoLeaksAndEquality(results, [...appActions, ...otherActions], appActionSchema);
    });
  });

  describe('AppData', () => {
    it('get all AppData for the member', async () => {
      const appData = await saveAppData({ item, creator: exportingActor });
      const appDataWithActorAsMember = await saveAppData({
        item: itemOfRandomUser,
        creator: randomUser,
        account: exportingActor,
      });
      const appDataWithOtherMember = await saveAppData({
        item,
        creator: exportingActor,
        account: randomUser,
      });

      // noise: for a random member
      await saveAppData({ item: itemOfRandomUser, creator: randomUser });

      const results = await new AppDataRepository().getForMemberExport(exportingActor.id);
      expectNoLeaksAndEquality(
        results,
        [...appData, ...appDataWithActorAsMember, ...appDataWithOtherMember],
        appDataSchema,
      );
    });
  });

  describe('AppSettings', () => {
    it('get all AppSettings for the member', async () => {
      const appSettings = await saveAppSettings({ item, creator: exportingActor });
      // noise: for a random member
      await saveAppSettings({
        item: itemOfRandomUser,
        creator: randomUser,
      });

      const results = await new AppSettingRepository().getForMemberExport(exportingActor.id);
      expectNoLeaksAndEquality(results, appSettings, appSettingSchema);
    });
  });

  describe('Chat', () => {
    let chatMessages: ChatMessage[];
    let chatMentions: ChatMention[];

    beforeEach(async () => {
      // exporting member mentions another user, so this mention data is for the random user only.
      ({ chatMessages } = await saveChatMessages({
        item,
        creator: exportingActor,
        mentionMember: randomUser,
      }));

      ({ chatMentions } = await saveChatMessages({
        item: itemOfRandomUser,
        creator: randomUser,
        mentionMember: exportingActor,
      }));
    });

    describe('ChatMentions', () => {
      it('get all ChatMentions for the member', async () => {
        const results = await new ChatMentionRepository().getForMemberExport(exportingActor.id);
        expectNoLeaksAndEquality(results, chatMentions, messageMentionSchema);
      });
    });

    describe('ChatMessages', () => {
      it('get all Messages for the member', async () => {
        const results = await new ChatMessageRepository().getExportByMember(exportingActor.id);
        expectNoLeaksAndEquality(results, chatMessages, messageSchema);
      });
    });
  });

  describe('Items', () => {
    it('get all Items for the member', async () => {
      const items = [
        item,
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
      ];

      // noise
      await itemTestUtils.saveItem({ actor: randomUser });
      await itemTestUtils.saveItem({ actor: randomUser });
      await itemTestUtils.saveItem({ actor: randomUser });

      const results = await new ItemRepository().getForMemberExport(exportingActor.id);
      expectNoLeaksAndEquality(results, items, itemSchema);
    });

    it('get all Item Favorites for the member', async () => {
      const items = [
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
      ];
      const favorites = await saveItemFavorites({
        items,
        member: exportingActor,
      });

      // noise
      await saveItemFavorites({ items: [itemOfRandomUser], member: randomUser });

      const results = await new FavoriteRepository().getForMemberExport(exportingActor.id);
      expectNoLeaksAndEquality(results, favorites, itemFavoriteSchema);
    });

    it('get all Item Likes for the member', async () => {
      // TODO: maybe insert beforeEach...
      const items = [
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
      ];
      const likes = await saveItemLikes(items, exportingActor);

      // noise
      await saveItemLikes([itemOfRandomUser], randomUser);
      await saveItemLikes(items, randomUser);

      const results = await new ItemLikeRepository().getByCreatorToExport(exportingActor.id);
      expectNoLeaksAndEquality(results, likes, itemLikeSchema);
    });

    it('get all Item Memberships for the member', async () => {
      const itemMembershipRepository = new ItemMembershipRepository();
      // TODO: maybe insert beforeEach...
      const actorItems = [
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
        await itemTestUtils.saveItem({ actor: exportingActor }),
      ];
      const randomItems = [
        await itemTestUtils.saveItem({ actor: randomUser }),
        await itemTestUtils.saveItem({ actor: randomUser }),
      ];

      const memberships: ItemMembership[] = [];

      for (const item of actorItems) {
        const membership = await itemTestUtils.saveMembership({
          item,
          account: exportingActor,
          permission: PermissionLevel.Admin,
        });
        memberships.push(membership);
      }

      for (const item of randomItems) {
        const membership = await itemTestUtils.saveMembership({
          item,
          account: exportingActor,
          permission: PermissionLevel.Read,
        });
        memberships.push(membership);
      }

      // noise
      await itemTestUtils.saveItemAndMembership({ creator: exportingActor, member: randomUser });
      await itemTestUtils.saveItemAndMembership({ creator: exportingActor, member: randomUser });
      await itemTestUtils.saveItemAndMembership({
        creator: exportingActor,
        member: randomUser,
        permission: PermissionLevel.Read,
      });

      const results = await itemMembershipRepository.getForMemberExport(exportingActor.id);
      expectNoLeaksAndEquality(results, memberships, itemMembershipSchema);
    });
  });
});
