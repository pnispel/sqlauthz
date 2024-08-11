import { SQLBackendContext, SQLEntities } from "./backend.js";
import { Clause } from "./clause.js";
export interface SQLTable {
    type: "table";
    schema: string;
    name: string;
}
export interface SQLView {
    type: "view";
    schema: string;
    name: string;
}
export interface SQLTableMetadata {
    type: "table-metadata";
    table: SQLTable;
    rlsEnabled: boolean;
    columns: string[];
}
export interface SQLSchema {
    type: "schema";
    name: string;
}
export interface SQLRowLevelSecurityPolicy {
    type: "rls-policy";
    name: string;
    table: SQLTable;
    users: SQLUser[];
}
export interface SQLFunction {
    type: "function";
    schema: string;
    name: string;
    builtin: boolean;
}
export interface SQLProcedure {
    type: "procedure";
    schema: string;
    name: string;
    builtin: boolean;
}
export interface SQLSequence {
    type: "sequence";
    schema: string;
    name: string;
}
export interface SQLUser {
    type: "user";
    name: string;
}
export interface SQLGroup {
    type: "group";
    name: string;
}
export type SQLActor = SQLUser | SQLGroup;
export declare const TablePrivileges: readonly ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
export type TablePrivilege = (typeof TablePrivileges)[number];
export declare const ViewPrivileges: readonly ["SELECT", "INSERT", "UPDATE", "DELETE", "TRIGGER"];
export type ViewPrivilege = (typeof ViewPrivileges)[number];
export declare const SchemaPrivileges: readonly ["USAGE", "CREATE"];
export type SchemaPrivilege = (typeof SchemaPrivileges)[number];
export declare const FunctionPrivileges: readonly ["EXECUTE"];
export type FunctionPrivilege = (typeof FunctionPrivileges)[number];
export declare const ProcedurePrivileges: readonly ["EXECUTE"];
export type ProcedurePrivilege = (typeof FunctionPrivileges)[number];
export declare const SequencePrivileges: readonly ["USAGE", "SELECT", "UPDATE"];
export type SequencePrivilege = (typeof SequencePrivileges)[number];
export interface BasePermission {
    user: SQLActor;
}
export interface TablePermission extends BasePermission {
    type: "table";
    table: SQLTable;
    privilege: TablePrivilege;
    columnClause: Clause;
    rowClause: Clause;
}
export interface SchemaPermission extends BasePermission {
    type: "schema";
    schema: SQLSchema;
    privilege: SchemaPrivilege;
}
export interface ViewPermission extends BasePermission {
    type: "view";
    view: SQLView;
    privilege: ViewPrivilege;
}
export interface FunctionPermission extends BasePermission {
    type: "function";
    function: SQLFunction;
    privilege: FunctionPrivilege;
}
export interface ProcedurePermission extends BasePermission {
    type: "procedure";
    procedure: SQLProcedure;
    privilege: ProcedurePrivilege;
}
export interface SequencePermission extends BasePermission {
    type: "sequence";
    sequence: SQLSequence;
    privilege: SequencePrivilege;
}
export type Permission = TablePermission | SchemaPermission | ViewPermission | FunctionPermission | ProcedurePermission | SequencePermission;
export type Privilege = {
    [P in Permission as P["type"]]: P["privilege"];
}[Permission["type"]];
export declare function parseQualifiedName(tableName: string): [string, string] | null;
export declare function formatQualifiedName(schema: string, name: string): string;
export interface ConstructFullQueryArgs {
    context: SQLBackendContext;
    entities: SQLEntities;
    revokeUsers: SQLActor[];
    permissions: Permission[];
    includeSetupAndTeardown?: boolean;
    includeTransaction?: boolean;
}
export declare function constructFullQuery({ entities, context, revokeUsers, permissions, includeSetupAndTeardown, includeTransaction, }: ConstructFullQueryArgs): string;
