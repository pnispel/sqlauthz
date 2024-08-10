import { Oso } from "oso";
import { SQLEntities } from "./backend.js";
import { Value } from "./clause.js";
import { LiteralsContext } from "./oso.js";
import { Permission, SQLActor } from "./sql.js";
export interface ConvertPermissionSuccess<P extends Permission = Permission> {
    type: "success";
    permissions: P[];
}
export interface ConvertPermissionError {
    type: "error";
    errors: string[];
}
export type ConvertPermissionResult<P extends Permission = Permission> = ConvertPermissionSuccess<P> | ConvertPermissionError;
export interface ConvertPermissionArgs {
    result: Map<string, unknown>;
    entities: SQLEntities;
    allowAnyActor?: boolean;
    strictFields?: boolean;
    debug?: boolean;
    literals: Map<string, Value>;
}
export declare function convertPermission({ result, entities, allowAnyActor, strictFields, debug, literals, }: ConvertPermissionArgs): ConvertPermissionResult;
export interface ParsePermissionsArgs {
    oso: Oso;
    entities: SQLEntities;
    allowAnyActor?: boolean;
    strictFields?: boolean;
    debug?: boolean;
    literalsContext: LiteralsContext;
}
export declare function parsePermissions({ oso, entities, allowAnyActor, strictFields, debug, literalsContext, }: ParsePermissionsArgs): Promise<ConvertPermissionResult>;
export declare function deduplicatePermissions(permissions: Permission[]): Permission[];
export interface UserRevokePolicyAll {
    type: "all";
}
export interface UserRevokePolicyReferenced {
    type: "referenced";
}
export interface UserRevokePolicyExplicit {
    type: "users";
    users: string[];
}
export type UserRevokePolicy = UserRevokePolicyAll | UserRevokePolicyReferenced | UserRevokePolicyExplicit;
export interface GetRevokeActorsArgs {
    userRevokePolicy?: UserRevokePolicy;
    permissions: Permission[];
    entities: SQLEntities;
}
export interface GetRevokeActorsSuccessResult {
    type: "success";
    users: SQLActor[];
}
export interface GetRevokeActorsErrorResult {
    type: "error";
    errors: string[];
}
export type GetRevokeActorsResult = GetRevokeActorsSuccessResult | GetRevokeActorsErrorResult;
export declare function getRevokeActors({ userRevokePolicy, permissions, entities, }: GetRevokeActorsArgs): GetRevokeActorsResult;
