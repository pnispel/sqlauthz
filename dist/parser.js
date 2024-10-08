import { Variable } from "oso";
import { ValidationError, evaluateClause, factorOrClauses, isColumn, isTrueClause, isValue, mapClauses, optimizeClause, simpleEvaluator, valueToClause, } from "./clause.js";
import { FunctionPrivileges, ProcedurePrivileges, SchemaPrivileges, SequencePrivileges, TablePrivileges, ViewPrivileges, formatQualifiedName, } from "./sql.js";
import { arrayProduct } from "./utils.js";
function actorEvaluator({ actor, debug, }) {
    const variableName = "actor";
    const errorVariableName = debug
        ? actor.type === "user"
            ? `user(${actor.name})`
            : `group(${actor.name})`
        : variableName;
    return simpleEvaluator({
        variableName,
        errorVariableName,
        getValue: (value) => {
            if (value.type === "value") {
                return value.value;
            }
            if (value.type === "function-call") {
                throw new ValidationError(`${errorVariableName}: invalid function call`);
            }
            if (value.value === "_this" || value.value === "_this.name") {
                return actor.name;
            }
            if (value.value === "_this.type") {
                return actor.type;
            }
            throw new ValidationError(`${errorVariableName}: invalid user field: ${value.value}`);
        },
    });
}
function validateActorClause(clause, actorNames) {
    const validateTopLevel = (clause) => {
        if (clause.type === "value") {
            if (typeof clause.value !== "string" || !actorNames.has(clause.value)) {
                return {
                    type: "error",
                    errors: [`Invalid user or group name: ${clause.value}`],
                };
            }
            return null;
        }
        if (clause.type === "expression") {
            const columnValue = clause.values.filter(isColumn).at(0);
            const valueValue = clause.values.filter(isValue).at(0);
            if (columnValue &&
                valueValue &&
                clause.operator === "Eq" &&
                (columnValue.value === "_this" || columnValue.value === "_this.name")) {
                return validateTopLevel(valueValue);
            }
            return null;
        }
        if (clause.type === "and" || clause.type === "or") {
            const results = clause.clauses.map(validateTopLevel);
            const errors = [];
            for (const result of results) {
                if (result === null) {
                    continue;
                }
                errors.push(...result.errors);
            }
            return errors.length > 0 ? { type: "error", errors } : null;
        }
        if (clause.type === "not") {
            return validateTopLevel(clause.clause);
        }
        return null;
    };
    return validateTopLevel(clause);
}
function validateResourceClause(clause) {
    const resourceTypes = new Set(Object.keys(handlers));
    const validateTopLevel = (clause) => {
        if (clause.type === "value") {
            return null;
        }
        if (clause.type === "expression") {
            const columnValue = clause.values.filter(isColumn).at(0);
            const valueValue = clause.values.filter(isValue).at(0);
            if (columnValue &&
                valueValue &&
                clause.operator === "Eq" &&
                columnValue.value === "_this.type" &&
                valueValue.type === "value") {
                if (typeof valueValue.value !== "string") {
                    return {
                        type: "error",
                        errors: [`Invalid object type: '${valueValue.value}'`],
                    };
                }
                const lowerValue = valueValue.value.toLowerCase();
                if (!resourceTypes.has(lowerValue)) {
                    return {
                        type: "error",
                        errors: [`Invalid object type: '${valueValue.value}'`],
                    };
                }
                return null;
            }
            return null;
        }
        if (clause.type === "and" || clause.type === "or") {
            const results = clause.clauses.map(validateTopLevel);
            const errors = [];
            for (const result of results) {
                if (result === null) {
                    continue;
                }
                errors.push(...result.errors);
            }
            return errors.length > 0 ? { type: "error", errors } : null;
        }
        if (clause.type === "not") {
            return validateTopLevel(clause.clause);
        }
        return null;
    };
    return validateTopLevel(clause);
}
function getReferencedPrivileges(clause) {
    const validateTopLevel = (clause) => {
        if (clause.type === "value") {
            return [clause.value];
        }
        if (clause.type === "expression") {
            const columnValue = clause.values.filter(isColumn).at(0);
            const valueValue = clause.values.filter(isValue).at(0);
            if (columnValue &&
                valueValue &&
                clause.operator === "Eq" &&
                columnValue.value === "_this") {
                return validateTopLevel(valueValue);
            }
            return [];
        }
        if (clause.type === "and" || clause.type === "or") {
            const results = clause.clauses.map(validateTopLevel);
            const privileges = [];
            for (const result of results) {
                privileges.push(...result);
            }
            return privileges;
        }
        if (clause.type === "not") {
            return validateTopLevel(clause.clause);
        }
        return [];
    };
    return validateTopLevel(clause);
}
function tableEvaluator({ table, clause, debug, strictFields, }) {
    const tableName = formatQualifiedName(table.table.schema, table.table.name);
    const variableName = "resource";
    const errorVariableName = debug ? `table(${tableName})` : variableName;
    const metaEvaluator = simpleEvaluator({
        variableName,
        errorVariableName,
        getValue: (value) => {
            if (value.type === "value") {
                return value.value;
            }
            if (value.type === "function-call") {
                throw new ValidationError(`${errorVariableName}: invalid function call`);
            }
            if (value.value === "_this") {
                return tableName;
            }
            if (value.value === "_this.name") {
                return table.table.name;
            }
            if (value.value === "_this.schema") {
                return table.table.schema;
            }
            if (value.value === "_this.type") {
                return table.table.type;
            }
            throw new ValidationError(`${errorVariableName}: invalid table field: ${value.value}`);
        },
    });
    const andParts = clause.type === "and" ? clause.clauses : [clause];
    const getColumnSpecifier = (column) => {
        let rest;
        if (column.value.startsWith("_this.")) {
            rest = column.value.slice("_this.".length);
        }
        else if (column.value.startsWith(`${tableName}.`)) {
            rest = column.value.slice(`${tableName}.`.length);
        }
        else {
            return null;
        }
        const restParts = rest.split(".");
        if (restParts[0] === "col" && restParts.length === 1) {
            return { type: "col" };
        }
        if (restParts[0] === "row" && restParts.length === 2) {
            return { type: "row", row: restParts[1] };
        }
        return null;
    };
    const isColumnClause = (clause) => {
        if (clause.type === "not") {
            return isColumnClause(clause.clause);
        }
        if (clause.type === "expression") {
            let colCount = 0;
            for (const value of clause.values) {
                if (value.type === "value") {
                    continue;
                }
                if (value.type === "function-call") {
                    const someCol = value.args.some((arg) => isColumnClause(arg));
                    if (someCol) {
                        colCount++;
                    }
                    continue;
                }
                const spec = getColumnSpecifier(value);
                if (spec && spec.type === "col") {
                    colCount++;
                    continue;
                }
                return false;
            }
            return colCount > 0;
        }
        if (clause.type === "function-call") {
            let colCount = 0;
            for (const value of clause.args) {
                if (value.type === "value") {
                    continue;
                }
                if (value.type === "function-call") {
                    const someCol = value.args.some((arg) => isColumnClause(arg));
                    if (someCol) {
                        colCount++;
                    }
                    continue;
                }
                const spec = getColumnSpecifier(value);
                if (spec && spec.type === "col") {
                    colCount++;
                    continue;
                }
                return false;
            }
            return colCount > 0;
        }
        return false;
    };
    const isRowClause = (clause) => {
        if (clause.type === "not") {
            return isRowClause(clause.clause);
        }
        if (clause.type === "expression") {
            let colCount = 0;
            for (const value of clause.values) {
                if (value.type === "value") {
                    continue;
                }
                if (value.type === "function-call") {
                    const someCol = value.args.some((arg) => isRowClause(arg));
                    if (someCol) {
                        colCount++;
                    }
                    continue;
                }
                const spec = getColumnSpecifier(value);
                if (spec && spec.type === "row") {
                    colCount++;
                    continue;
                }
                return false;
            }
            return colCount > 0;
        }
        if (clause.type === "function-call") {
            let colCount = 0;
            for (const value of clause.args) {
                if (value.type === "value") {
                    continue;
                }
                if (value.type === "function-call") {
                    const someCol = value.args.some((arg) => isRowClause(arg));
                    if (someCol) {
                        colCount++;
                    }
                    continue;
                }
                const spec = getColumnSpecifier(value);
                if (spec && spec.type === "row") {
                    colCount++;
                    continue;
                }
                return false;
            }
            return colCount > 0;
        }
        if (clause.type === "column") {
            const spec = getColumnSpecifier(clause);
            return spec && spec.type === "row";
        }
        return false;
    };
    const metaClauses = [];
    const colClauses = [];
    const rowClauses = [];
    for (const clause of andParts) {
        if (isColumnClause(clause)) {
            colClauses.push(clause);
        }
        else if (isRowClause(clause)) {
            rowClauses.push(clause);
        }
        else {
            metaClauses.push(clause);
        }
    }
    const rawColClause = colClauses.length === 1
        ? colClauses[0]
        : { type: "and", clauses: colClauses };
    const errors = [];
    const columnClause = mapClauses(rawColClause, (clause) => {
        if (clause.type === "column") {
            return { type: "column", value: "col" };
        }
        if (clause.type === "value") {
            if (typeof clause.value !== "string") {
                errors.push(`${errorVariableName}: invalid column specifier: ${clause.value}`);
            }
            else if (!table.columns.includes(clause.value)) {
                errors.push(`${errorVariableName}: invalid column for ${tableName}: ${clause.value}`);
            }
        }
        return clause;
    });
    const rawRowClause = rowClauses.length === 1
        ? rowClauses[0]
        : { type: "and", clauses: rowClauses };
    const rowClause = mapClauses(rawRowClause, (clause) => {
        if (clause.type === "column") {
            let key;
            if (clause.value.startsWith(`${tableName}.`)) {
                key = clause.value.slice(`${tableName}.row.`.length);
            }
            else {
                key = clause.value.slice("_this.row.".length);
            }
            if (!table.columns.includes(key)) {
                errors.push(`${errorVariableName}: invalid column for ${tableName}: ${key}`);
            }
            return { type: "column", value: key };
        }
        return clause;
    });
    const evalResult = evaluateClause({
        clause: { type: "and", clauses: metaClauses },
        evaluate: metaEvaluator,
        strictFields,
    });
    if (evalResult.type === "error") {
        return evalResult;
    }
    if (!evalResult.result) {
        return { type: "no-match" };
    }
    if (errors.length > 0) {
        return { type: "error", errors };
    }
    return {
        type: "match",
        columnClause,
        rowClause,
    };
}
function schemaEvaluator({ schema, debug, }) {
    const variableName = "resource";
    const errorVariableName = debug ? `schema(${schema.name})` : variableName;
    return simpleEvaluator({
        variableName,
        errorVariableName,
        getValue: (value) => {
            if (value.type === "value") {
                return value.value;
            }
            if (value.type === "function-call") {
                throw new ValidationError(`${errorVariableName}: invalid function call`);
            }
            if (value.value === "_this" ||
                value.value === "_this.name" ||
                value.value === "_this.schema") {
                return schema.name;
            }
            if (value.value === "_this.type") {
                return schema.type;
            }
            throw new ValidationError(`${errorVariableName}: invalid schema field: ${value.value}`);
        },
    });
}
function simpleSchemaQualifiedObjectEvaluatorFactory({ type, getName, getSchema, }) {
    return ({ obj, debug }) => {
        const variableName = "resource";
        const schema = getSchema(obj);
        const name = getName(obj);
        const qualifiedName = formatQualifiedName(schema, name);
        const errorVariableName = debug
            ? `${type}(${qualifiedName})`
            : variableName;
        return simpleEvaluator({
            variableName,
            errorVariableName,
            getValue: (value) => {
                if (value.type === "value") {
                    return value.value;
                }
                if (value.type === "function-call") {
                    throw new ValidationError(`${errorVariableName}: invalid function call`);
                }
                if (value.value === "_this") {
                    return qualifiedName;
                }
                if (value.value === "_this.name") {
                    return name;
                }
                if (value.value === "_this.schema") {
                    return schema;
                }
                if (value.value === "_this.type") {
                    return type;
                }
                throw new ValidationError(`${errorVariableName}: invalid view field: ${value.value}`);
            },
        });
    };
}
const viewEvaluator = simpleSchemaQualifiedObjectEvaluatorFactory({
    type: "view",
    getName: (obj) => obj.name,
    getSchema: (obj) => obj.schema,
});
const functionEvaluator = simpleSchemaQualifiedObjectEvaluatorFactory({
    type: "function",
    getName: (obj) => obj.name,
    getSchema: (obj) => obj.schema,
});
const procedureEvaluator = simpleSchemaQualifiedObjectEvaluatorFactory({
    type: "procedure",
    getName: (obj) => obj.name,
    getSchema: (obj) => obj.schema,
});
const sequenceEvaluator = simpleSchemaQualifiedObjectEvaluatorFactory({
    type: "sequence",
    getName: (obj) => obj.name,
    getSchema: (obj) => obj.schema,
});
function permissionEvaluator({ permission, debug, }) {
    const variableName = "action";
    const errorVariableName = debug ? `permission(${permission})` : variableName;
    return simpleEvaluator({
        variableName,
        errorVariableName,
        getValue: (value) => {
            if (value.type === "function-call") {
                throw new ValidationError(`${errorVariableName}: invalid function call`);
            }
            if (value.type === "value" && typeof value.value === "string") {
                return value.value.toUpperCase();
            }
            if (value.type === "value") {
                return value.value;
            }
            if (value.value === "_this" || value.value === "_this.name") {
                return permission.toUpperCase();
            }
            throw new ValidationError(`${errorVariableName}: invalid permission field: ${value.value}`);
        },
    });
}
function isIdentityClause(clause, variable) {
    return clause.type === "column" && clause.value === variable;
}
const handlers = {
    table: {
        privileges: TablePrivileges,
        getPermissions: ({ clause, users, privileges, entities, strictFields, debug, }) => {
            if (privileges.length === 0) {
                return { type: "success", permissions: [] };
            }
            const errors = [];
            const permissions = [];
            for (const table of entities.tables) {
                const result = tableEvaluator({
                    table,
                    clause,
                    strictFields,
                    debug,
                });
                if (result.type === "error") {
                    errors.push(...result.errors);
                }
                else if (result.type === "match") {
                    for (const [user, privilege] of arrayProduct([users, privileges])) {
                        permissions.push({
                            type: "table",
                            table: table.table,
                            user,
                            privilege,
                            columnClause: result.columnClause,
                            rowClause: result.rowClause,
                        });
                    }
                }
            }
            if (errors.length > 0) {
                return { type: "error", errors };
            }
            return { type: "success", permissions };
        },
        getDeduplicationKey: (permission) => {
            return [
                permission.type,
                permission.privilege,
                permission.user.name,
                formatQualifiedName(permission.table.schema, permission.table.name),
            ].join(",");
        },
        deduplicate: (permissions) => {
            const [first, ...rest] = permissions;
            const rowClause = optimizeClause({
                type: "or",
                clauses: [first.rowClause, ...rest.map((perm) => perm.rowClause)],
            });
            const columnClause = optimizeClause({
                type: "or",
                clauses: [
                    first.columnClause,
                    ...rest.map((perm) => perm.columnClause),
                ],
            });
            return {
                type: "table",
                user: first.user,
                table: first.table,
                privilege: first.privilege,
                rowClause,
                columnClause,
            };
        },
    },
    schema: {
        privileges: SchemaPrivileges,
        getPermissions: ({ clause, users, privileges, entities, strictFields, debug, }) => {
            if (privileges.length === 0) {
                return { type: "success", permissions: [] };
            }
            const errors = [];
            const schemas = [];
            const permissions = [];
            for (const schema of entities.schemas) {
                const result = evaluateClause({
                    clause,
                    evaluate: schemaEvaluator({ schema, debug }),
                    strictFields,
                });
                if (result.type === "error") {
                    errors.push(...result.errors);
                }
                else if (result.result) {
                    schemas.push(schema);
                }
            }
            for (const [user, privilege, schema] of arrayProduct([
                users,
                privileges,
                schemas,
            ])) {
                permissions.push({
                    type: "schema",
                    schema,
                    privilege,
                    user,
                });
            }
            if (errors.length > 0) {
                return { type: "error", errors };
            }
            return { type: "success", permissions };
        },
        getDeduplicationKey: (permission) => {
            return [
                permission.type,
                permission.privilege,
                permission.user.name,
                permission.schema.name,
            ].join(",");
        },
        deduplicate: (permissions) => {
            return permissions[0];
        },
    },
    view: {
        privileges: ViewPrivileges,
        getPermissions: ({ clause, users, privileges, entities, strictFields, debug, }) => {
            const views = [];
            const errors = [];
            const permissions = [];
            for (const view of entities.views) {
                const result = evaluateClause({
                    clause,
                    evaluate: viewEvaluator({ obj: view, debug }),
                    strictFields,
                });
                if (result.type === "error") {
                    errors.push(...result.errors);
                }
                else if (result.result) {
                    views.push(view);
                }
            }
            for (const [user, privilege, view] of arrayProduct([
                users,
                privileges,
                views,
            ])) {
                permissions.push({
                    type: "view",
                    view,
                    privilege,
                    user,
                });
            }
            if (errors.length > 0) {
                return { type: "error", errors };
            }
            return { type: "success", permissions };
        },
        getDeduplicationKey: (permission) => {
            return [
                permission.type,
                permission.privilege,
                permission.user.name,
                formatQualifiedName(permission.view.schema, permission.view.name),
            ].join(",");
        },
        deduplicate: (permissions) => {
            return permissions[0];
        },
    },
    function: {
        privileges: FunctionPrivileges,
        getPermissions: ({ clause, users, privileges, entities, strictFields, debug, }) => {
            const functions = [];
            const errors = [];
            const permissions = [];
            for (const func of entities.functions) {
                if (func.builtin) {
                    continue;
                }
                const result = evaluateClause({
                    clause,
                    evaluate: functionEvaluator({ obj: func, debug }),
                    strictFields,
                });
                if (result.type === "error") {
                    errors.push(...result.errors);
                }
                else if (result.result) {
                    functions.push(func);
                }
            }
            for (const [user, privilege, func] of arrayProduct([
                users,
                privileges,
                functions,
            ])) {
                permissions.push({
                    type: "function",
                    function: func,
                    privilege,
                    user,
                });
            }
            if (errors.length > 0) {
                return { type: "error", errors };
            }
            return { type: "success", permissions };
        },
        getDeduplicationKey: (permission) => {
            return [
                permission.type,
                permission.privilege,
                permission.user.name,
                formatQualifiedName(permission.function.schema, permission.function.name),
            ].join(",");
        },
        deduplicate: (permissions) => {
            return permissions[0];
        },
    },
    procedure: {
        privileges: ProcedurePrivileges,
        getPermissions: ({ clause, users, privileges, entities, strictFields, debug, }) => {
            const procedures = [];
            const errors = [];
            const permissions = [];
            for (const proc of entities.procedures) {
                if (proc.builtin) {
                    continue;
                }
                const result = evaluateClause({
                    clause,
                    evaluate: procedureEvaluator({ obj: proc, debug }),
                    strictFields,
                });
                if (result.type === "error") {
                    errors.push(...result.errors);
                }
                else if (result.result) {
                    procedures.push(proc);
                }
            }
            for (const [user, privilege, proc] of arrayProduct([
                users,
                privileges,
                procedures,
            ])) {
                permissions.push({
                    type: "procedure",
                    procedure: proc,
                    privilege,
                    user,
                });
            }
            if (errors.length > 0) {
                return { type: "error", errors };
            }
            return { type: "success", permissions };
        },
        getDeduplicationKey: (permission) => {
            return [
                permission.type,
                permission.privilege,
                permission.user.name,
                formatQualifiedName(permission.procedure.schema, permission.procedure.name),
            ].join(",");
        },
        deduplicate: (permissions) => {
            return permissions[0];
        },
    },
    sequence: {
        privileges: SequencePrivileges,
        getPermissions: ({ clause, users, privileges, entities, strictFields, debug, }) => {
            const sequences = [];
            const errors = [];
            const permissions = [];
            for (const sequence of entities.sequences) {
                const result = evaluateClause({
                    clause,
                    evaluate: sequenceEvaluator({ obj: sequence, debug }),
                    strictFields,
                });
                if (result.type === "error") {
                    errors.push(...result.errors);
                }
                else if (result.result) {
                    sequences.push(sequence);
                }
            }
            for (const [user, privilege, sequence] of arrayProduct([
                users,
                privileges,
                sequences,
            ])) {
                permissions.push({
                    type: "sequence",
                    sequence,
                    privilege,
                    user,
                });
            }
            if (errors.length > 0) {
                return { type: "error", errors };
            }
            return { type: "success", permissions };
        },
        getDeduplicationKey: (permission) => {
            return [
                permission.type,
                permission.privilege,
                permission.user.name,
                formatQualifiedName(permission.sequence.schema, permission.sequence.name),
            ].join(",");
        },
        deduplicate: (permissions) => {
            return permissions[0];
        },
    },
};
export function convertPermission({ result, entities, allowAnyActor, strictFields, debug, literals, }) {
    const resource = result.get("resource");
    const action = result.get("action");
    const actor = result.get("actor");
    const getClause = (arg) => {
        const clause = valueToClause(arg);
        return mapClauses(clause, (subClause) => {
            if (subClause.type !== "column") {
                return subClause;
            }
            const literal = literals.get(subClause.value);
            if (!literal) {
                return subClause;
            }
            return literal;
        });
    };
    const actorClause = getClause(actor);
    const actionClause = getClause(action);
    const resourceClause = getClause(resource);
    const actorOrs = factorOrClauses(actorClause);
    const actionOrs = factorOrClauses(actionClause);
    const resourceOrs = factorOrClauses(resourceClause);
    const errors = [];
    const permissions = [];
    const allActors = entities.users.concat(entities.groups);
    const actorNames = new Set(allActors.map((actor) => actor.name));
    for (const actorOr of actorOrs) {
        const result = validateActorClause(actorOr, actorNames);
        if (result !== null) {
            errors.push(...result.errors);
        }
    }
    for (const resourceOr of resourceOrs) {
        const result = validateResourceClause(resourceOr);
        if (result !== null) {
            errors.push(...result.errors);
        }
    }
    for (const [actorOr, actionOr, resourceOr] of arrayProduct([
        actorOrs,
        actionOrs,
        resourceOrs,
    ])) {
        if (!allowAnyActor &&
            (isTrueClause(actorOr) || isIdentityClause(actorOr, "actor"))) {
            errors.push("rule does not specify a user");
        }
        const users = [];
        for (const actor of allActors) {
            const result = evaluateClause({
                clause: actorOr,
                evaluate: actorEvaluator({ actor, debug }),
                strictFields,
            });
            if (result.type === "error") {
                errors.push(...result.errors);
            }
            else if (result.result) {
                users.push(actor);
            }
        }
        if (users.length === 0) {
            continue;
        }
        const allPrivileges = new Set();
        for (const handler of Object.values(handlers)) {
            const privileges = [];
            for (const privilege of handler.privileges) {
                const result = evaluateClause({
                    clause: actionOr,
                    evaluate: permissionEvaluator({ permission: privilege, debug }),
                    strictFields,
                });
                if (result.type === "error") {
                    errors.push(...result.errors);
                }
                else if (result.result) {
                    privileges.push(privilege);
                    allPrivileges.add(privilege);
                }
            }
            const result = handler.getPermissions({
                clause: resourceOr,
                // biome-ignore lint/suspicious/noExplicitAny: tricky type situation
                privileges: privileges,
                users,
                entities,
                strictFields,
                debug,
            });
            if (result.type === "success") {
                permissions.push(...result.permissions);
            }
            else {
                errors.push(...result.errors);
            }
        }
        if (allPrivileges.size === 0) {
            const referenced = getReferencedPrivileges(actionOr);
            for (const ref of referenced) {
                errors.push(`Invalid privilege name: '${ref}'`);
            }
        }
    }
    if (errors.length > 0) {
        return {
            type: "error",
            errors,
        };
    }
    return {
        type: "success",
        permissions,
    };
}
export async function parsePermissions({ oso, entities, allowAnyActor, strictFields, debug, literalsContext, }) {
    return await literalsContext.use(async () => {
        const result = oso.queryRule({
            acceptExpression: true,
        }, "allow", new Variable("actor"), new Variable("action"), new Variable("resource"));
        const permissions = [];
        const errors = [];
        for await (const item of result) {
            const result = convertPermission({
                result: item,
                entities,
                allowAnyActor,
                strictFields,
                debug,
                literals: literalsContext.get(),
            });
            if (result.type === "success") {
                permissions.push(...result.permissions);
            }
            else {
                errors.push(...result.errors);
            }
        }
        if (errors.length > 0) {
            return {
                type: "error",
                errors: Array.from(new Set(errors)),
            };
        }
        return {
            type: "success",
            permissions,
        };
    });
}
export function deduplicatePermissions(permissions) {
    const permissionsByKey = {};
    for (const permission of permissions) {
        const handler = handlers[permission.type];
        // biome-ignore lint/suspicious/noExplicitAny: deep type intersection
        const key = handler.getDeduplicationKey(permission);
        permissionsByKey[key] ??= [];
        permissionsByKey[key].push(permission);
    }
    const outPermissions = [];
    for (const groupedPermissions of Object.values(permissionsByKey)) {
        const first = groupedPermissions[0];
        const handler = handlers[first.type];
        // biome-ignore lint/suspicious/noExplicitAny: deep type intersection
        const newPermission = handler.deduplicate(groupedPermissions);
        outPermissions.push(newPermission);
    }
    return outPermissions;
}
function deduplicateArray(array, key) {
    const itemsByKey = Object.fromEntries(array.map((item) => [key(item), item]));
    return Object.values(itemsByKey);
}
export function getRevokeActors({ userRevokePolicy, permissions, entities, }) {
    const revokePolicy = userRevokePolicy ?? { type: "referenced" };
    const referencedActors = deduplicateArray(permissions.map((permission) => permission.user), (actor) => actor.name);
    const allActors = deduplicateArray(entities.users.concat(entities.groups), (actor) => actor.name);
    const actorsByName = Object.fromEntries(allActors.map((actor) => [actor.name, actor]));
    let usersToRevoke;
    const errors = [];
    switch (revokePolicy.type) {
        case "all":
            usersToRevoke = allActors;
            break;
        case "users": {
            usersToRevoke = [];
            for (const user of revokePolicy.users) {
                const actor = actorsByName[user];
                if (!actor) {
                    errors.push(`Invalid user or group in user revoke policy: ${user}`);
                    continue;
                }
                usersToRevoke.push(actor);
            }
            break;
        }
        case "referenced": {
            usersToRevoke = referencedActors;
        }
    }
    const usersToRevokeByName = Object.fromEntries(usersToRevoke.map((user) => [user.name, user]));
    const notFoundUsers = new Set();
    for (const permission of permissions) {
        if (!usersToRevokeByName[permission.user.name]) {
            if (notFoundUsers.has(permission.user.name)) {
                continue;
            }
            notFoundUsers.add(permission.user.name);
            errors.push(`Permission granted to ${permission.user.type} outside of ` +
                `revoke policy: ${permission.user.name}`);
        }
    }
    if (errors.length > 0) {
        return { type: "error", errors };
    }
    return { type: "success", users: usersToRevoke };
}
//# sourceMappingURL=parser.js.map