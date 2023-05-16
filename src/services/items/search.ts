import {fastify, FastifyInstance} from 'fastify';
import { MeiliSearch } from 'meilisearch';
import {
    IdParam,
    IdsParams,
    Item,
    ItemTaskManager,
    MAX_TARGETS_FOR_MODIFY_REQUEST_W_RESPONSE,
    ParentIdParam,
    PermissionLevel,
  } from '@graasp/sdk';
import { ItemTagService } from 'graasp-item-tags';

function getParentId(path:string){
  const separator = '.';
  const split_path = path.split(separator);
  if (split_path.length == 1)
    return null;
  const regx = /_/g;
  return split_path[split_path.length - 2].replace(regx,'-');
}
const searchPlugin = async (instance:FastifyInstance, options: { tags: { service: ItemTagService }}) => {
          const { tags: { service: itemTagService }} = options;
          //create indexes to store different filesmm
          const { publish, items, db } = instance;
          const { taskManager: publishTaskManager } = publish;
          const { taskManager: itemsTaskManager, dbService: itemService } = items;
          const { pool } = db;
          const { taskRunner } = instance;
          const publishItemTaskName = publishTaskManager.getPublishItemTaskName();
          const updateItemTaskName = itemsTaskManager.getUpdateTaskName();
          const deleteItemTaskName = itemsTaskManager.getDeleteTaskName();
          const moveItemTaskName = itemsTaskManager.getMoveTaskName();
          const itemIndex = 'testitem';
          
          // itemsTaskManager.get
          
          const meilisearchClient = new MeiliSearch({
            host: 'http://meilisearch:8080',
            apiKey: '2416ed3f3e8d109faa75f415e2c04ba27eec5da31cbacaaa9bd8832655d1',
          });

          const status = await meilisearchClient.isHealthy();
          if (status) {
            meilisearchClient.getIndex(itemIndex).catch(() => {
              meilisearchClient.createIndex(itemIndex).then(res => {
                console.log('Create new index:' + itemIndex);
              })
              .catch(err => {
                 console.log('Error creating index:' + itemIndex + ' err: ' + err);
              });
            });
          }

          taskRunner.setTaskPostHookHandler<Item>(
            publishItemTaskName,
            async (item, member, { log, handler }) => {

              meilisearchClient.isHealthy().then(() => {
                meilisearchClient.getIndex(itemIndex).catch(err => {
                  console.log('Document can not be added: ' + err);
                });
                
                // const jsonChildItem = JSON.string
                meilisearchClient.index(itemIndex).addDocuments([item]).then(() => {
                  console.log('Item added to meilisearch');
                }).catch(err => {
                  console.log('There was a problem adding ' + item + 'to meilisearch ' + err);
                });

              }).catch(err => {
                console.log('Server is not healthy' + err);
              });
              
              meilisearchClient.index(itemIndex).updateSearchableAttributes(['name','description']).then(() => {
                console.log('Setting for searchable Attributes has changed');
              }).catch( err => {
                console.log('There was an error changing the configuration of meilisearch db' + err);
              });
              if (item.type == 'folder'){
                (itemService.getDescendants(item, handler)).then(children=>{
                  children.forEach(childItem => {
                    meilisearchClient.isHealthy().then(() => {
                      meilisearchClient.getIndex(itemIndex).catch(err => {
                        console.log('Document can not be added: ' + err);
                      });
                      
                      // const jsonChildItem = JSON.string
                      meilisearchClient.index(itemIndex).addDocuments([childItem]).then(() => {
                        console.log('Item added to meilisearch');
                      }).catch(err => {
                        console.log('There was a problem adding ' + childItem + 'to meilisearch ' + err);
                      });
  
                    }).catch(err => {
                      console.log('Server is not healthy' + err);
                    });
  
                  });
                });
              }
            },
          );

          taskRunner.setTaskPreHookHandler<Item>(
            deleteItemTaskName,
            async (item, member, { log, handler }) => {
                meilisearchClient.isHealthy().then(() => {
                    meilisearchClient.getIndex(itemIndex).catch(err => {
                      console.log('Document can not be deleted: ' + err);
                    });
                    
                    meilisearchClient.index(itemIndex).deleteDocument(item.id).then(() => {
                      console.log('Item deleted');
                    }).catch(err => {
                      console.log('There was a problem deleting ' + item + 'to meilisearch ' + err);
                    });
    
                  }).catch(err => {
                    console.log('Server is not healthy' + err);
                  });
            },

          );


          taskRunner.setTaskPostHookHandler<Item>(
            updateItemTaskName,
            async (item, member, { log, handler }) => {
                meilisearchClient.isHealthy().then(() => {
                    meilisearchClient.getIndex(itemIndex).catch(err => {
                      console.log('Document can not be deleted: ' + err);
                    });
                    
                    meilisearchClient.index(itemIndex).updateDocuments([item]).then(() => {
                      console.log('Item updated');
                    }).catch(err => {
                      console.log('There was a problem updating ' + item + 'to meilisearch ' + err);
                    });
    
                  }).catch(err => {
                    console.log('Server is not healthy' + err);
                  });
            },

          );
          
          let wasARoot = false;
          taskRunner.setTaskPreHookHandler<Item>(
            moveItemTaskName,
            async (item, member, { log, handler }) => {
                wasARoot = false;
                const parentID = getParentId(item.path);
                if (parentID == null){
                  wasARoot = true;
                } 
              },
          );

          taskRunner.setTaskPostHookHandler<Item>(
            moveItemTaskName,
            async (item, member, { log, handler }) => {
                const isReady = await meilisearchClient.isHealthy();
                if (!isReady) {
                  return;
                }

                const parentID = getParentId(item.path);
                let published = false;
                const id_publish = 'a8d8e09d-a0b9-4551-b300-125abe25a0f9';
                if (parentID != null && !wasARoot)
                {
                  
                  const parent = await itemService.get(parentID, handler);
                  published = await itemTagService.hasTag(parent, id_publish,handler);
                } 
                else 
                {
                  //this is a root, and therefore we should check if this is published
                  published = await itemTagService.hasTag(item, id_publish,handler);
                  if (parentID != null && !published)
                  {
                    const parent = await itemService.get(parentID, handler);
                    published = await itemTagService.hasTag(parent, id_publish,handler);
                  }
                  console.log('the top file published res' + published);
                }
                try
                {
                  await  meilisearchClient.getIndex(itemIndex);
                  
                  if(published) {
                    await meilisearchClient.index(itemIndex).updateDocuments([item]);
                  } else {

                    try
                    {
                      await meilisearchClient.index(itemIndex).getDocument(item.id);
                      await meilisearchClient.index(itemIndex).deleteDocument(item.id);
                    }
                    catch
                    {
                      //the item has never been published
                    }
                  }
                }
                catch(err){
                  console.log('There was a problem in moving operations: ' + err);
                }
            },

          );




        };





        

export default searchPlugin;