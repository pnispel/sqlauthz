import { AsyncLocalStorage } from "node:async_hooks";
import { Oso, Variable } from "oso";
import { Predicate } from "oso/dist/src/Predicate.js";
import { valueToClause } from "./clause.js";
import { FunctionPrivileges, ProcedurePrivileges, SchemaPrivileges, SequencePrivileges, TablePrivileges, ViewPrivileges, } from "./sql.js";
export function registerFunctions(oso, functions) {
    const storage = new AsyncLocalStorage();
    let varIndex = 1;
    const get = () => {
        const map = storage.getStore();
        if (!map) {
            throw new Error("Not in SQL literal context");
        }
        return map;
    };
    const osoFunctionCaller = (name, schema) => {
        const fullName = `${schema}.${name}`;
        // biome-ignore lint/complexity/useArrowFunction: Need the `name` attribute
        const result = function (...args) {
            return new Predicate(fullName, args);
        };
        Object.defineProperty(result, "name", { value: fullName, writable: false });
        return result;
    };
    const schemaFunctions = {};
    const topLevelFunctions = {};
    for (const sqlFunc of functions) {
        const osoFunc = osoFunctionCaller(sqlFunc.name, sqlFunc.schema);
        if (sqlFunc.builtin) {
            topLevelFunctions[sqlFunc.name] = osoFunc;
        }
        schemaFunctions[sqlFunc.schema] ??= {};
        schemaFunctions[sqlFunc.schema][sqlFunc.name] = osoFunc;
    }
    Object.assign(topLevelFunctions, schemaFunctions);
    topLevelFunctions.lit = function lit(arg) {
        const varName = `lit_${varIndex}`;
        varIndex++;
        const map = get();
        map.set(varName, valueToClause(arg));
        return new Variable(varName);
    };
    topLevelFunctions.cast = function cast(arg, type) {
        return new Predicate("cast", [arg, type]);
    };
    oso.registerConstant(topLevelFunctions, "sql");
    const permissions = {
        schema: SchemaPrivileges,
        table: TablePrivileges,
        view: ViewPrivileges,
        function: FunctionPrivileges,
        procedure: ProcedurePrivileges,
        sequence: SequencePrivileges,
    };
    oso.registerConstant(permissions, "permissions");
    return {
        use: (func) => storage.run(new Map(), func),
        get,
    };
}
export async function createOso({ paths, functions, vars, }) {
    const oso = new Oso();
    const literalsContext = registerFunctions(oso, functions);
    for (const [key, value] of Object.entries(vars ?? {})) {
        oso.registerConstant(value, key);
    }
    try {
        await oso.loadFiles(paths);
    }
    catch (error) {
        if (error instanceof Error) {
            throw new OsoError(error.message);
        }
        throw error;
    }
    return { oso, literalsContext };
}
export class OsoError extends Error {
}
//# sourceMappingURL=oso.js.map