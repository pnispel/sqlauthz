import fs from "node:fs";
import { fdir } from "fdir";
import { Variable } from "oso";
import { Expression } from "oso/dist/src/Expression.js";
import { Pattern } from "oso/dist/src/Pattern.js";
import { Predicate } from "oso/dist/src/Predicate.js";
export function printExpression(obj) {
    const prefix = "  ";
    if (obj instanceof Expression) {
        const lines = [`${obj.operator}:`];
        for (const arg of obj.args) {
            const output = printExpression(arg).split("\n");
            const withPrefix = output.map((line) => prefix + line);
            lines.push(...withPrefix);
        }
        return lines.join("\n");
    }
    if (obj instanceof Pattern) {
        const fields = JSON.stringify(obj.fields);
        return `pattern(${obj.tag}, ${fields})`;
    }
    if (obj instanceof Variable) {
        return `var(${obj.name})`;
    }
    if (obj instanceof Predicate) {
        const lines = [`${obj.name}:`];
        for (const arg of obj.args) {
            const output = printExpression(arg).split("\n");
            const withPrefix = output.map((line) => prefix + line);
            lines.push(...withPrefix);
        }
        return lines.join("\n");
    }
    // biome-ignore lint/suspicious/noExplicitAny: debugging code
    return obj.toString();
}
export function printQuery(query) {
    const lines = [];
    const prefix = "  ";
    for (const [key, value] of query.entries()) {
        lines.push(`${key}:`);
        const exprLines = printExpression(value).split("\n");
        const withPrefix = exprLines.map((line) => prefix + line);
        lines.push(...withPrefix);
    }
    return lines.join("\n");
}
export function valueToSqlLiteral(value) {
    if (typeof value === "string") {
        return `'${value.replaceAll("'", "''")}'`;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            return "null";
        }
        return value.toString();
    }
    if (typeof value === "boolean") {
        return value.toString();
    }
    if (value === null || value === undefined) {
        return "null";
    }
    if (value instanceof Date) {
        return valueToSqlLiteral(value.toISOString());
    }
    throw new Error(`Unhandled SQL literal type: ${value}`);
}
// biome-ignore lint/suspicious/noExplicitAny: generic
export function* arrayProduct(inputs) {
    if (inputs.length === 0) {
        return;
    }
    if (inputs.length === 1) {
        for (const item of inputs[0]) {
            yield [item];
        }
        return;
    }
    for (const item of inputs[0]) {
        for (const rest of arrayProduct(inputs.slice(1))) {
            yield [item].concat(rest);
        }
    }
    // Old implementation based on my clever little algo; keeping it around
    // for now. The implementation above is much easier to understand though.
    // const cumulativeProducts: number[] = [];
    // let totalCombinations = 1;
    // for (const clauses of inputs) {
    //   cumulativeProducts.push(totalCombinations);
    //   totalCombinations *= clauses.length;
    // }
    // for (let i = 0; i < totalCombinations; i++) {
    //   const outItems = inputs.map((values, idx) => {
    //     const cumulativeProduct = cumulativeProducts[idx]!;
    //     const cycle = values.length * cumulativeProduct;
    //     const remainder = i % cycle;
    //     const outIdx = Math.floor(remainder / cumulativeProduct);
    //     return values[outIdx]!;
    //   });
    //   yield outItems as ArrayProductItem<A>;
    // }
}
export async function strictGlob(...globs) {
    const out = new Set();
    for (const pattern of globs) {
        if (pattern.includes("*")) {
            const result = await new fdir()
                .glob(pattern)
                .withBasePath()
                .crawl(".")
                .withPromise();
            for (const item of result) {
                out.add(item);
            }
        }
        else {
            if (!fs.existsSync(pattern)) {
                throw new PathNotFound(pattern);
            }
            out.add(pattern);
        }
    }
    return Array.from(out);
}
export class PathNotFound extends Error {
    path;
    constructor(path) {
        super(`File not found: ${path}`);
        this.path = path;
    }
}
//# sourceMappingURL=utils.js.map