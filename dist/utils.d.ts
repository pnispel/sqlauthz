export declare function printExpression(obj: unknown): string;
export declare function printQuery(query: Map<string, unknown>): string;
export declare function valueToSqlLiteral(value: unknown): string;
type ArrayProductItem<A extends readonly (readonly any[])[]> = A extends readonly [] ? readonly [] : A extends readonly [infer T extends readonly any[]] ? readonly [T[number]] : A extends readonly [
    infer T extends readonly any[],
    ...infer R extends readonly (readonly any[])[]
] ? readonly [T[number], ...ArrayProductItem<R>] : A extends readonly (infer T)[] ? T : never;
export type ArrayProduct<A extends readonly (readonly any[])[]> = Generator<ArrayProductItem<A>>;
export declare function arrayProduct<A extends readonly [any, ...any[]]>(inputs: A): ArrayProduct<A>;
export declare function arrayProduct<A extends readonly (readonly any[])[]>(inputs: A): ArrayProduct<A>;
export declare function strictGlob(...globs: string[]): Promise<string[]>;
export declare class PathNotFound extends Error {
    readonly path: string;
    constructor(path: string);
}
export {};
