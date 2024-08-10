import pg from "pg";
import { SQLBackend, SQLBackendContext, SQLEntities } from "./backend.js";
export declare class PostgresBackend implements SQLBackend {
    private readonly client;
    constructor(client: pg.Client);
    fetchEntities(): Promise<SQLEntities>;
    private quoteIdentifier;
    private quoteTopLevelName;
    private quoteQualifiedName;
    private loadSqlFile;
    getContext(entities: SQLEntities): Promise<SQLBackendContext>;
    private evalColumnQuery;
    private clauseToSql;
    private compileGrantQuery;
}
