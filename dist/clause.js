import { Variable } from "oso";
import { Expression } from "oso/dist/src/Expression.js";
import { Pattern } from "oso/dist/src/Pattern.js";
import { Predicate } from "oso/dist/src/Predicate.js";
import { arrayProduct } from "./utils.js";
export const TrueClause = {
    type: "and",
    clauses: [],
};
export const FalseClause = {
    type: "or",
    clauses: [],
};
export function isTrueClause(clause) {
    return clause.type === "and" && clause.clauses.length === 0;
}
export function isFalseClause(clause) {
    return clause.type === "or" && clause.clauses.length === 0;
}
export function isColumn(clause) {
    return clause.type === "column";
}
export function isValue(clause) {
    return clause.type === "value";
}
export function mapClauses(clause, func) {
    if (clause.type === "and" || clause.type === "or") {
        const subClauses = clause.clauses.map((subClause) => mapClauses(subClause, func));
        return func({
            type: clause.type,
            clauses: subClauses,
        });
    }
    if (clause.type === "not") {
        const subClause = mapClauses(clause.clause, func);
        return func({
            type: "not",
            clause: subClause,
        });
    }
    if (clause.type === "expression") {
        const newValues = clause.values.map((value) => mapClauses(value, func));
        return func({
            type: "expression",
            operator: clause.operator,
            values: newValues,
        });
    }
    if (clause.type === "function-call") {
        const values = clause.args.map((arg) => mapClauses(arg, func));
        return func({
            type: "function-call",
            schema: clause.schema,
            name: clause.name,
            args: values,
        });
    }
    return func(clause);
}
function clausesEqual(clause1, clause2) {
    if (clause1.type !== clause2.type) {
        return false;
    }
    if ((clause1.type === "and" && clause2.type === "and") ||
        (clause1.type === "or" && clause2.type === "or")) {
        const deduped1 = deduplicateClauses(clause1.clauses);
        const deduped2 = deduplicateClauses(clause2.clauses);
        return (deduped1.length === deduped2.length &&
            deduped1.every((clause, idx) => clausesEqual(clause, deduped2[idx])));
    }
    if (clause1.type === "not" && clause2.type === "not") {
        return clausesEqual(clause1.clause, clause2.clause);
    }
    if (clause1.type === "expression" && clause2.type === "expression") {
        return (clause1.operator === clause2.operator &&
            clause1.values.every((value, idx) => clausesEqual(value, clause2.values[idx])));
    }
    if ((clause1.type === "value" && clause2.type === "value") ||
        (clause1.type === "column" && clause2.type === "column")) {
        return clause1.value === clause2.value;
    }
    if (clause1.type === "function-call" && clause2.type === "function-call") {
        return (clause1.name === clause2.name &&
            clause1.schema === clause2.schema &&
            clause1.args.length === clause2.args.length &&
            clause1.args.every((arg, idx) => arg === clause2.args[idx]));
    }
    return false;
}
function deduplicateClauses(clauses) {
    if (clauses.length <= 1) {
        return clauses;
    }
    if (clauses.length === 2) {
        if (clausesEqual(clauses[0], clauses[1])) {
            return [clauses[0]];
        }
        return clauses;
    }
    const first = clauses[0];
    const rest = deduplicateClauses(clauses.slice(1));
    const out = [first];
    for (const clause of rest) {
        if (!clausesEqual(first, clause)) {
            out.push(clause);
        }
    }
    return out;
}
export function optimizeClause(clause) {
    if (clause.type === "and") {
        const outClauses = [];
        for (const subClause of deduplicateClauses(clause.clauses)) {
            const optimized = optimizeClause(subClause);
            if (isTrueClause(optimized)) {
                continue;
            }
            if (isFalseClause(optimized)) {
                return FalseClause;
            }
            if (optimized.type === "and") {
                outClauses.push(...optimized.clauses);
                continue;
            }
            outClauses.push(optimized);
        }
        if (outClauses.length === 1) {
            return outClauses[0];
        }
        return {
            type: "and",
            clauses: outClauses,
        };
    }
    if (clause.type === "or") {
        const outClauses = [];
        for (const subClause of deduplicateClauses(clause.clauses)) {
            const optimized = optimizeClause(subClause);
            if (isTrueClause(optimized)) {
                return TrueClause;
            }
            if (isFalseClause(optimized)) {
                continue;
            }
            if (optimized.type === "or") {
                outClauses.push(...optimized.clauses);
                continue;
            }
            outClauses.push(optimized);
        }
        if (outClauses.length === 1) {
            return outClauses[0];
        }
        return { type: "or", clauses: outClauses };
    }
    if (clause.type === "not") {
        const optimized = optimizeClause(clause.clause);
        if (optimized.type === "and") {
            const orClause = {
                type: "or",
                clauses: optimized.clauses.map((subClause) => {
                    return { type: "not", clause: subClause };
                }),
            };
            return optimizeClause(orClause);
        }
        if (optimized.type === "or") {
            const andClause = {
                type: "and",
                clauses: optimized.clauses.map((subClause) => ({
                    type: "not",
                    clause: subClause,
                })),
            };
            return optimizeClause(andClause);
        }
        return { type: "not", clause: optimized };
    }
    return clause;
}
export function valueToClause(value) {
    if (value instanceof Expression) {
        if (value.operator === "And") {
            const outClauses = value.args.map((arg) => valueToClause(arg));
            return { type: "and", clauses: outClauses };
        }
        if (value.operator === "Or") {
            const outClauses = value.args.map((arg) => valueToClause(arg));
            return { type: "or", clauses: outClauses };
        }
        if (value.operator === "Dot") {
            if (typeof value.args[0] === "string") {
                const col = {
                    type: "column",
                    value: ["_this", value.args[1]].join("."),
                };
                return {
                    type: "and",
                    clauses: [
                        col,
                        {
                            type: "expression",
                            operator: "Eq",
                            values: [
                                { type: "column", value: "_this" },
                                { type: "value", value: value.args[0] },
                            ],
                        },
                    ],
                };
            }
            const args = value.args.map((arg) => valueToClause(arg));
            const src = args[0];
            const name = args[1];
            // TODO: is this the right behavior?
            if (src.type === "function-call" || name.type === "function-call") {
                throw new Error("Unexpected function call");
            }
            if (src.type === "and") {
                const col = src.clauses[0];
                const newCol = {
                    type: "column",
                    value: [col.value, name.value].join("."),
                };
                return {
                    type: "and",
                    clauses: [newCol, ...src.clauses.slice(1)],
                };
            }
            return {
                type: "column",
                value: [src.value, name.value].join("."),
            };
        }
        if (value.operator === "Not") {
            const subClause = valueToClause(value.args[0]);
            return {
                type: "not",
                clause: subClause,
            };
            // Ignore these operators
        }
        if (value.operator === "Cut" ||
            value.operator === "Assign" ||
            value.operator === "ForAll" ||
            value.operator === "Isa" ||
            value.operator === "Print") {
            return TrueClause;
        }
        const clauses = [];
        const leftClause = valueToClause(value.args[0]);
        let left;
        if (leftClause.type === "and") {
            left = leftClause.clauses[0];
            clauses.push(...leftClause.clauses.slice(1));
        }
        else {
            left = leftClause;
        }
        const rightClause = valueToClause(value.args[1]);
        let right;
        if (rightClause.type === "and") {
            right = rightClause.clauses[0];
            clauses.push(...rightClause.clauses.slice(1));
        }
        else {
            right = rightClause;
        }
        const operator = value.operator === "Unify" ? "Eq" : value.operator;
        const newClause = {
            type: "expression",
            operator,
            values: [left, right],
        };
        if (clauses.length > 0) {
            return { type: "and", clauses: [newClause, ...clauses] };
        }
        return newClause;
    }
    if (value instanceof Variable) {
        return {
            type: "column",
            value: value.name,
        };
    }
    if (value instanceof Pattern) {
        // TODO
        return TrueClause;
    }
    if (value instanceof Predicate) {
        const parts = value.name.split(".");
        let schema;
        let name;
        if (parts.length === 1) {
            schema = "";
            name = parts[0];
        }
        else {
            schema = parts[0];
            name = parts[1];
        }
        const clauses = [];
        const args = [];
        for (const arg of value.args) {
            const subClause = valueToClause(arg);
            if (subClause.type === "and") {
                args.push(subClause.clauses[0]);
                clauses.push(...subClause.clauses.slice(1));
            }
            else {
                args.push(subClause);
            }
        }
        const newClause = {
            type: "function-call",
            schema: schema,
            name: name,
            args,
        };
        if (clauses.length > 0) {
            return { type: "and", clauses: [newClause, ...clauses] };
        }
        return newClause;
    }
    return { type: "value", value };
}
export function factorOrClauses(clause) {
    const inner = (clause) => {
        if (clause.type === "and") {
            const subOrs = clause.clauses.map((subClause) => factorOrClauses(subClause));
            return Array.from(arrayProduct(subOrs)).map((subClauses) => ({
                type: "and",
                clauses: subClauses,
            }));
        }
        if (clause.type === "or") {
            return clause.clauses.flatMap((subClause) => factorOrClauses(subClause));
        }
        if (clause.type === "not") {
            const subClauses = factorOrClauses(clause.clause);
            if (subClauses.length > 1) {
                const negativeAndClause = {
                    type: "and",
                    clauses: subClauses.map((subClause) => ({
                        type: "not",
                        clause: subClause,
                    })),
                };
                return factorOrClauses(negativeAndClause);
            }
            return [{ type: "not", clause: subClauses[0] }];
        }
        return [clause];
    };
    return inner(optimizeClause(clause)).map((subClause) => optimizeClause(subClause));
}
export function evaluateClause({ clause, evaluate, strictFields, }) {
    if (clause.type === "and") {
        const errors = [];
        let result = true;
        for (const subClause of clause.clauses) {
            const clauseResult = evaluateClause({ clause: subClause, evaluate });
            if (clauseResult.type === "success") {
                result &&= clauseResult.result;
            }
            else {
                errors.push(...clauseResult.errors);
            }
        }
        if ((strictFields || result) && errors.length > 0) {
            return { type: "error", errors };
        }
        return { type: "success", result };
    }
    if (clause.type === "or") {
        const errors = [];
        let result = false;
        for (const subClause of clause.clauses) {
            const clauseResult = evaluateClause({ clause: subClause, evaluate });
            if (clauseResult.type === "success") {
                result ||= clauseResult.result;
            }
            else {
                errors.push(...clauseResult.errors);
            }
        }
        if (errors.length > 0) {
            return { type: "error", errors };
        }
        return { type: "success", result };
    }
    if (clause.type === "not") {
        const clauseResult = evaluateClause({ clause: clause.clause, evaluate });
        if (clauseResult.type === "success") {
            return { type: "success", result: !clauseResult.result };
        }
        return { type: "error", errors: clauseResult.errors };
    }
    return evaluate(clause);
}
export function simpleEvaluator({ variableName, errorVariableName, getValue, }) {
    const func = (expr) => {
        if (expr.type === "column" && expr.value === variableName) {
            return { type: "success", result: true };
        }
        if (expr.type === "column") {
            return {
                type: "error",
                errors: [`${errorVariableName}: invalid reference: ${expr.value}`],
            };
        }
        if (expr.type === "value") {
            return func({
                type: "expression",
                operator: "Eq",
                values: [{ type: "column", value: "_this" }, expr],
            });
        }
        if (expr.type === "function-call") {
            // TODO: is this the right behavior?
            return {
                type: "error",
                errors: [`${errorVariableName}: unexpected function call`],
            };
        }
        let operatorFunc;
        if (expr.operator === "Eq") {
            operatorFunc = (a, b) => a === b;
        }
        else if (expr.operator === "Neq") {
            operatorFunc = (a, b) => a !== b;
        }
        else if (expr.operator === "Geq") {
            operatorFunc = (a, b) => a >= b;
        }
        else if (expr.operator === "Gt") {
            operatorFunc = (a, b) => a > b;
        }
        else if (expr.operator === "Lt") {
            operatorFunc = (a, b) => a < b;
        }
        else if (expr.operator === "Leq") {
            operatorFunc = (a, b) => a <= b;
        }
        else {
            return {
                type: "error",
                errors: [
                    `${errorVariableName}: unsupported operator: ${expr.operator}`,
                ],
            };
        }
        if (expr.values[0].type === "value" && expr.values[1].type === "value") {
            return {
                type: "success",
                result: operatorFunc(expr.values[0].value, expr.values[1].value),
            };
        }
        const errors = [];
        // biome-ignore lint/suspicious/noExplicitAny: needed here
        let left;
        // biome-ignore lint/suspicious/noExplicitAny: needed here
        let right;
        try {
            left = getValue(expr.values[0]);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                errors.push(error.message);
            }
            else {
                throw error;
            }
        }
        try {
            right = getValue(expr.values[1]);
        }
        catch (error) {
            if (error instanceof ValidationError) {
                errors.push(error.message);
            }
            else {
                throw error;
            }
        }
        if (errors.length > 0) {
            return { type: "error", errors };
        }
        return { type: "success", result: operatorFunc(left, right) };
    };
    return func;
}
export class ValidationError extends Error {
    message;
    constructor(message) {
        super(message);
        this.message = message;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
//# sourceMappingURL=clause.js.map