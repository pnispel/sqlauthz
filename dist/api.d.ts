import { SQLBackend, SQLEntities } from "./backend.js";
import { CreateOsoArgs } from "./oso.js";
import { UserRevokePolicy } from "./parser.js";
export interface CompileQueryArgs extends Omit<CreateOsoArgs, "functions"> {
    backend: SQLBackend;
    entities?: SQLEntities;
    userRevokePolicy?: UserRevokePolicy;
    includeSetupAndTeardown?: boolean;
    includeTransaction?: boolean;
    strictFields?: boolean;
    allowAnyActor?: boolean;
    debug?: boolean;
}
export interface CompileQuerySuccess {
    type: "success";
    query: string;
}
export interface CompileQueryError {
    type: "error";
    errors: string[];
}
export type CompileQueryResult = CompileQuerySuccess | CompileQueryError;
export declare function compileQuery({ backend, entities, userRevokePolicy, includeSetupAndTeardown, includeTransaction, debug, strictFields, allowAnyActor, paths, vars, }: CompileQueryArgs): Promise<CompileQueryResult>;
