import type { SQL } from 'bun';

export const makeMockSql = (responses: unknown[][] = []) => {
  const queries: string[] = [];
  const sql = ((
    strings: TemplateStringsArray | unknown,
    ..._values: unknown[]
  ) => {
    if (Array.isArray(strings) && Object.hasOwn(strings, 'raw')) {
      queries.push(strings.join('?'));
      return Promise.resolve(responses.shift() ?? []);
    }

    return strings;
  }) as unknown as SQL;

  (
    sql as unknown as {
      transaction: <T>(
        callback: (transaction: SQL) => Promise<T>,
      ) => Promise<T>;
    }
  ).transaction = (callback) => callback(sql);

  return { client: sql, queries };
};
