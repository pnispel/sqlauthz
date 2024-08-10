import { createOso } from "./oso.js";
import { deduplicatePermissions, getRevokeActors, parsePermissions, } from "./parser.js";
import { constructFullQuery } from "./sql.js";
export async function compileQuery({ backend, entities, userRevokePolicy, includeSetupAndTeardown, includeTransaction, debug, strictFields, allowAnyActor, paths, vars, }) {
    if (entities === undefined) {
        entities = await backend.fetchEntities();
    }
    const { oso, literalsContext } = await createOso({
        paths,
        functions: entities.functions,
        vars,
    });
    const result = await parsePermissions({
        oso,
        entities,
        debug,
        strictFields,
        allowAnyActor,
        literalsContext,
    });
    if (result.type !== "success") {
        return result;
    }
    const permissions = deduplicatePermissions(result.permissions);
    const actorsToRevoke = getRevokeActors({
        userRevokePolicy,
        permissions,
        entities,
    });
    if (actorsToRevoke.type !== "success") {
        return actorsToRevoke;
    }
    const context = await backend.getContext(entities);
    const fullQuery = constructFullQuery({
        entities,
        context,
        permissions,
        revokeUsers: actorsToRevoke.users,
        includeSetupAndTeardown,
        includeTransaction,
    });
    return { type: "success", query: fullQuery };
}
//# sourceMappingURL=api.js.map