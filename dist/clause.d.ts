import { PolarOperator } from "oso/dist/src/types.js";
export interface Literal {
    readonly type: "value";
    readonly value: unknown;
}
export interface FunctionCall {
    readonly type: "function-call";
    readonly schema: string;
    readonly name: string;
    readonly args: Value[];
}
export interface Column {
    readonly type: "column";
    readonly value: string;
}
export type Value = Literal | Column | FunctionCall;
export interface ExpressionClause {
    readonly type: "expression";
    readonly operator: PolarOperator;
    readonly values: readonly [Value, Value];
}
export interface NotClause {
    readonly type: "not";
    readonly clause: Clause;
}
export interface AndClause {
    readonly type: "and";
    readonly clauses: readonly Clause[];
}
export interface OrClause {
    readonly type: "or";
    readonly clauses: readonly Clause[];
}
export type Clause = ExpressionClause | NotClause | AndClause | OrClause | Value;
export declare const TrueClause: {
    readonly type: "and";
    readonly clauses: readonly [];
};
export declare const FalseClause: {
    readonly type: "or";
    readonly clauses: readonly [];
};
export declare function isTrueClause(clause: Clause): clause is AndClause & {
    clauses: [];
};
export declare function isFalseClause(clause: Clause): clause is OrClause & {
    clauses: [];
};
export declare function isColumn(clause: Clause): clause is Column;
export declare function isValue(clause: Clause): clause is Value;
export declare function mapClauses(clause: Clause, func: (clause: Clause) => Clause): Clause;
export declare function optimizeClause(clause: Clause): Clause;
export declare function valueToClause(value: unknown): Clause;
export declare function factorOrClauses(clause: Clause): Clause[];
export interface EvaluateClauseArgs {
    clause: Clause;
    evaluate: (expr: Exclude<Clause, AndClause | OrClause | NotClause>) => EvaluateClauseResult;
    strictFields?: boolean;
}
export interface EvaluateClauseSuccess {
    type: "success";
    result: boolean;
}
export interface EvaluateClauseError {
    type: "error";
    errors: string[];
}
export type EvaluateClauseResult = EvaluateClauseSuccess | EvaluateClauseError;
export declare function evaluateClause({ clause, evaluate, strictFields, }: EvaluateClauseArgs): EvaluateClauseResult;
export interface SimpleEvaluatorArgs {
    variableName: string;
    errorVariableName: string;
    getValue: (value: Value) => any;
}
export declare function simpleEvaluator({ variableName, errorVariableName, getValue, }: SimpleEvaluatorArgs): EvaluateClauseArgs["evaluate"];
export declare class ValidationError extends Error {
    readonly message: string;
    constructor(message: string);
}
