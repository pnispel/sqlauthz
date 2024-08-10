import { Oso } from "oso";
import { Value } from "./clause.js";
import { SQLFunction } from "./sql.js";
export interface LiteralsContext {
    use: <T>(func: () => Promise<T>) => Promise<T>;
    get: () => Map<string, Value>;
}
export declare function registerFunctions(oso: Oso, functions: SQLFunction[]): LiteralsContext;
export interface CreateOsoArgs {
    paths: string[];
    functions: SQLFunction[];
    vars?: Record<string, unknown>;
}
export interface CreateOsoResult {
    oso: Oso;
    literalsContext: LiteralsContext;
}
export declare function createOso({ paths, functions, vars, }: CreateOsoArgs): Promise<CreateOsoResult>;
export declare class OsoError extends Error {
}
