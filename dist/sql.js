export const TablePrivileges = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
];
export const ViewPrivileges = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRIGGER",
];
export const SchemaPrivileges = ["USAGE", "CREATE"];
export const FunctionPrivileges = ["EXECUTE"];
export const ProcedurePrivileges = ["EXECUTE"];
export const SequencePrivileges = ["USAGE", "SELECT", "UPDATE"];
export function parseQualifiedName(tableName) {
    const parts = tableName.split(".");
    if (parts.length !== 2) {
        return null;
    }
    return parts;
}
export function formatQualifiedName(schema, name) {
    return `${schema}.${name}`;
}
export function constructFullQuery({ entities, context, revokeUsers, permissions, includeSetupAndTeardown, includeTransaction, }) {
    if (includeSetupAndTeardown === undefined) {
        includeSetupAndTeardown = true;
    }
    if (includeTransaction === undefined) {
        includeTransaction = true;
    }
    const queryParts = [];
    if (context.transactionStartQuery && includeTransaction) {
        queryParts.push(context.transactionStartQuery);
    }
    if (context.setupQuery && includeSetupAndTeardown) {
        queryParts.push(context.setupQuery);
    }
    if (includeSetupAndTeardown) {
        const removeQueries = context.removeAllPermissionsFromActorsQueries(revokeUsers, entities);
        queryParts.push(...removeQueries);
    }
    const grantQueries = context.compileGrantQueries(permissions, entities);
    queryParts.push(...grantQueries);
    if (context.teardownQuery && includeSetupAndTeardown) {
        queryParts.push(context.teardownQuery);
    }
    if (context.transactionCommitQuery && includeTransaction) {
        queryParts.push(context.transactionCommitQuery);
    }
    return queryParts.join("\n");
}
//# sourceMappingURL=sql.js.map