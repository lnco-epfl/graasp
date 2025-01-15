import { MOCK_LOGGER } from '../../../../../../../../test/app';
import HookManager from '../../../../../../../utils/hook';
import { ItemService } from '../../../../../service';
import { ItemPublishedService } from '../../service';
import { MeiliSearchWrapper } from './meilisearch';
import { SearchService } from './service';

const meilisearchClient = {
  search: jest.fn(async () => {
    return {} as never;
  }),
  getActiveIndexName: jest.fn(() => 'indexname'),
} as unknown as MeiliSearchWrapper;

const searchService = new SearchService(
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hooks: { setPostHook: jest.fn() } as unknown as HookManager<any>,
  } as ItemService,
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    hooks: { setPostHook: jest.fn() } as unknown as HookManager<any>,
  } as ItemPublishedService,
  meilisearchClient,
  MOCK_LOGGER,
);

describe('search', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('filter by tags', async () => {
    const MOCK_RESULT = { hits: [] } as never;
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.search({
      tags: {
        discipline: ['fiction', 'hello'],
        level: ['secondary school', "tag:'hello'"],
        'resource-type': ['type'],
      },
    });
    expect(results).toEqual(MOCK_RESULT);

    const { filter } = spy.mock.calls[0][0].queries[0];
    expect(filter).toContain("discipline IN ['fiction','hello']");
    expect(filter).toContain("level IN ['secondary school','tag:\\'hello\\'']");
    expect(filter).toContain("resource-type IN ['type']");
    expect(filter).toContain('isHidden = false');
  });
  it('filter by langs', async () => {
    const MOCK_RESULT = { hits: [] } as never;
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.search({
      langs: ['fr', 'en'],
    });
    expect(results).toEqual(MOCK_RESULT);

    const { filter } = spy.mock.calls[0][0].queries[0];
    expect(filter).toContain('lang IN [fr,en]');
    expect(filter).toContain('isHidden = false');
  });
  it('filter by published root', async () => {
    const MOCK_RESULT = { hits: [] } as never;
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.search({
      isPublishedRoot: true,
    });
    expect(results).toEqual(MOCK_RESULT);

    const { filter } = spy.mock.calls[0][0].queries[0];
    expect(filter).toContain('isPublishedRoot = true');
    expect(filter).toContain('isHidden = false');
  });
  it('filter by query', async () => {
    const MOCK_RESULT = { hits: [] } as never;
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.search({
      query: 'hello',
    });
    expect(results).toEqual(MOCK_RESULT);

    const { q } = spy.mock.calls[0][0].queries[0];
    expect(q).toEqual('hello');
  });
  it('apply sort', async () => {
    const MOCK_RESULT = { hits: [] } as never;
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.search({
      sort: ['likes:desc'],
    });
    expect(results).toEqual(MOCK_RESULT);

    const { sort } = spy.mock.calls[0][0].queries[0];
    expect(sort).toEqual(['likes:desc']);
  });
});

describe('getMostLiked', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('apply sort by likes', async () => {
    const MOCK_RESULT = { hits: [] } as never;
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.getMostLiked(4);
    expect(results).toEqual(MOCK_RESULT);

    const { sort, limit } = spy.mock.calls[0][0].queries[0];
    expect(sort).toEqual(['likes:desc']);
    expect(limit).toEqual(4);
  });
});

describe('getFacets', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('filter by tags', async () => {
    const MOCK_RESULT = {
      indexUid: 'index',
      hits: [],
      facetDistribution: { lang: { en: 1 } },
      processingTimeMs: 1,
      query: '',
    };
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT as never] });

    const results = await searchService.getFacets('lang', {
      tags: {
        discipline: ['fiction', 'hello'],
        level: ['secondary school', "aujourd'hui"],
        'resource-type': ['type'],
      },
    });
    expect(results).toEqual(MOCK_RESULT.facetDistribution.lang);

    const { filter } = spy.mock.calls[0][0].queries[0];
    expect(filter).toContain("discipline IN ['fiction','hello']");
    expect(filter).toContain("level IN ['secondary school','aujourd\\'hui']");
    expect(filter).toContain("resource-type IN ['type']");
  });
  it('filter by langs', async () => {
    const MOCK_RESULT = {
      indexUid: 'index',
      hits: [],
      facetDistribution: { lang: { en: 1 } },
      processingTimeMs: 1,
      query: '',
    };
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.getFacets('lang', {
      langs: ['fr', 'en'],
    });
    expect(results).toEqual(MOCK_RESULT.facetDistribution.lang);

    const { filter } = spy.mock.calls[0][0].queries[0];
    expect(filter).toContain('lang IN [fr,en]');
  });
  it('filter by published root', async () => {
    const MOCK_RESULT = {
      indexUid: 'index',
      hits: [],
      facetDistribution: { lang: { en: 1 } },
      processingTimeMs: 1,
      query: '',
    };
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.getFacets('lang', {
      isPublishedRoot: true,
    });
    expect(results).toEqual(MOCK_RESULT.facetDistribution.lang);

    const { filter } = spy.mock.calls[0][0].queries[0];
    expect(filter).toContain('isPublishedRoot = true');
  });
  it('filter by query', async () => {
    const MOCK_RESULT = {
      indexUid: 'index',
      hits: [],
      facetDistribution: { lang: { en: 1 } },
      processingTimeMs: 1,
      query: '',
    };
    const spy = jest
      .spyOn(meilisearchClient, 'search')
      .mockResolvedValue({ results: [MOCK_RESULT] });

    const results = await searchService.getFacets('lang', {
      query: 'hello',
    });
    expect(results).toEqual(MOCK_RESULT.facetDistribution.lang);

    const { q } = spy.mock.calls[0][0].queries[0];
    expect(q).toEqual('hello');
  });
});
