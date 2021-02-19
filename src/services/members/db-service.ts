// global
import {
  sql,
  DatabaseTransactionConnectionType as TrxHandler
} from 'slonik';
// local
import { Member } from './interfaces/member';

declare module 'fastify' {
  interface FastifyInstance {
    memberService: MemberService;
  }
}

/**
 * Database's first layer of abstraction for Members
 */
export class MemberService {
  // the 'safe' way to dynamically generate the columns names:
  private static allColumns = sql.join(
    [
      'id', 'name', 'email', 'type', 'extra',
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ].map(c =>
      !Array.isArray(c) ?
        sql.identifier([c]) :
        sql.join(c.map(cwa => sql.identifier([cwa])), sql` AS `)
    ),
    sql`, `
  );

  /**
   * Get member(s) matching the properties of the given (partial) member.
   * Excludes `extra`, `created_at`, and `updated_at`.
   * @param member Partial member
   * @param dbHandler Database handler
   * @param properties List of Member properties to fetch - defaults to 'all'
   */
  async getMatching(member: Partial<Member>, dbHandler: TrxHandler, properties?: (keyof Member)[]): Promise<Partial<Member>[]> {
    let selectColumns;

    if (properties && properties.length) {
      selectColumns = sql.join(
        properties.map(p => sql.identifier([p])),
        sql`, `
      );
    }

    // TODO: 'createdAt' and 'updatedAt' are not handled properly - will not match any column.
    const whereConditions = sql.join(
      Object.keys(member)
        .reduce((acc, key: keyof Member) =>
          (key === 'extra' || key === 'createdAt' || key === 'updatedAt') ? acc :
          acc.concat(sql.join([sql.identifier([key]), sql`${member[key]}`], sql` = `)),
          []),
      sql` AND `
    );

    return dbHandler
      .query<Partial<Member>>(sql`
        SELECT ${selectColumns || MemberService.allColumns}
        FROM member
        WHERE ${whereConditions}
      `)
      // TODO: is there a better way?
      .then(({ rows }) => rows.slice(0));
  }


  /**
   * Get member matching the given `id` or `null`, if not found.
   * @param id Member's id
   * @param dbHandler Database handler
   * @param properties List of Member properties to fetch - defaults to 'all'
   */
  async get(id: string, dbHandler: TrxHandler, properties?: (keyof Member)[]): Promise<Partial<Member>> {
    let selectColumns;

    if (properties && properties.length) {
      selectColumns = sql.join(
        properties.map(p => sql.identifier([p])),
        sql`, `
      );
    }

    return dbHandler
      .query<Partial<Member>>(sql`
        SELECT ${selectColumns || MemberService.allColumns}
        FROM member
        WHERE id = ${id}
      `)
      .then(({ rows }) => rows[0]);
  }

  /**
   * Create member and return it.
   * @param member Member to create
   * @param transactionHandler Database transaction handler
   */
  async create(member: Partial<Member>, transactionHandler: TrxHandler): Promise<Member> {
    // dynamically build a [{column1, value1}, {column2, value2}, ...] based on the
    // properties present in member
    const columnsAndValues = Object.keys(member)
      .map((key: keyof Member) => {
        const column = sql.identifier([key]);
        const value = key !== 'extra' ? sql`${member[key]}` : sql.json(member[key]);
        return { column, value };
      });

    const columns = columnsAndValues.map(({ column: c }) => c);
    const values = columnsAndValues.map(({ value: v }) => v);

    return transactionHandler
      .query<Member>(sql`
        INSERT INTO member (${sql.join(columns, sql`, `)})
        VALUES (${sql.join(values, sql`, `)})
        RETURNING ${MemberService.allColumns}
      `)
      .then(({ rows }) => rows[0]);
  }
}
