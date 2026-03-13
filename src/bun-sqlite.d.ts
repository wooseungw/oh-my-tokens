declare module "bun:sqlite" {
  export interface DatabaseOptions {
    readonly?: boolean;
    readwrite?: boolean;
    create?: boolean;
    busy_timeout?: number;
  }

  export class Statement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): void;
  }

  export class Database {
    constructor(filename: string, options?: DatabaseOptions);
    query(sql: string): Statement;
    exec(sql: string): void;
    close(): void;
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
  }
}
