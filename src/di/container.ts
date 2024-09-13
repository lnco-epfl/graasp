import { Redis } from 'ioredis';

import { FastifyInstance } from 'fastify';

import { BaseLogger } from '../logger';
import { MailerService } from '../plugins/mailer/service';
import { fileRepositoryFactory } from '../services/file/utils/factory';
import FileItemService from '../services/item/plugins/file/service';
import { ImportExportService } from '../services/item/plugins/importExport/service';
import { PublicationService } from '../services/item/plugins/publication/publicationState/service';
import { ValidationQueue } from '../services/item/plugins/publication/validation/validationQueue';
import { ItemService } from '../services/item/service';
import {
  FILE_ITEM_PLUGIN_OPTIONS,
  FILE_ITEM_TYPE,
  GEOLOCATION_API_KEY,
  IMAGE_CLASSIFIER_API,
  MAILER_CONFIG_FROM_EMAIL,
  MAILER_CONFIG_PASSWORD,
  MAILER_CONFIG_SMTP_HOST,
  MAILER_CONFIG_SMTP_PORT,
  MAILER_CONFIG_SMTP_USE_SSL,
  MAILER_CONFIG_USERNAME,
  REDIS_HOST,
  REDIS_PASSWORD,
  REDIS_PORT,
  REDIS_USERNAME,
  S3_FILE_ITEM_PLUGIN_OPTIONS,
} from '../utils/config';
import { buildRepositories } from '../utils/repositories';
import {
  FASTIFY_LOGGER_DI_KEY,
  FILE_ITEM_TYPE_DI_KEY,
  FILE_REPOSITORY_DI_KEY,
  GEOLOCATION_API_KEY_DI_KEY,
  IMAGE_CLASSIFIER_API_DI_KEY,
} from './constants';
import { registerValue, resolveDependency } from './utils';

export const registerDependencies = (instance: FastifyInstance) => {
  const { log, db } = instance;

  // register FastifyBasLogger as a value to allow BaseLogger to be injected automatically.
  registerValue(FASTIFY_LOGGER_DI_KEY, log);

  // register file type for the StorageService.
  registerValue(FILE_ITEM_TYPE_DI_KEY, FILE_ITEM_TYPE);

  // register classifier key for the ValidationService.
  registerValue(IMAGE_CLASSIFIER_API_DI_KEY, IMAGE_CLASSIFIER_API);

  // register geolocation key for the ItemGeolocationService.
  registerValue(GEOLOCATION_API_KEY_DI_KEY, GEOLOCATION_API_KEY);

  registerValue(
    Redis,
    new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      username: REDIS_USERNAME,
      password: REDIS_PASSWORD,
    }),
  );

  registerValue(
    MailerService,
    new MailerService({
      host: MAILER_CONFIG_SMTP_HOST,
      port: MAILER_CONFIG_SMTP_PORT,
      useSsl: MAILER_CONFIG_SMTP_USE_SSL,
      username: MAILER_CONFIG_USERNAME,
      password: MAILER_CONFIG_PASSWORD,
      fromEmail: MAILER_CONFIG_FROM_EMAIL,
    }),
  );

  // register the interface FileRepository with the concrete repo returned by the factory.
  registerValue(
    FILE_REPOSITORY_DI_KEY,
    fileRepositoryFactory(FILE_ITEM_TYPE, {
      s3: S3_FILE_ITEM_PLUGIN_OPTIONS,
      local: FILE_ITEM_PLUGIN_OPTIONS,
    }),
  );

  registerValue(
    ImportExportService,
    new ImportExportService(
      db,
      resolveDependency(FileItemService),
      resolveDependency(ItemService),
      resolveDependency(BaseLogger),
    ),
  );

  // This code will be improved when we will be able to inject the repositories.
  const { itemTagRepository, itemValidationGroupRepository, itemPublishedRepository } =
    buildRepositories();
  registerValue(
    PublicationService,
    new PublicationService(
      resolveDependency(ItemService),
      itemTagRepository,
      itemValidationGroupRepository,
      itemPublishedRepository,
      resolveDependency(ValidationQueue),
    ),
  );
};
