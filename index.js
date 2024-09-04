/**
 * @typedef { 'field access' | 'nullable field access' | 'equals' | 'and' | 'or' | 'not' | 'null coalescing' } Operator
 */

/**
 * @typedef { Operator | '(' | ')' | 'null' | 'undefined' | 'true' | 'false' | 'identifier' | 'number' | 'string' } TokenType
 */

/**
 * @typedef {Object} Token
 * @property {TokenType} type
 * @property {number} at
 * @property {string | number} [value]
 */

/**
 *
 * @generator 
 * @param {string} input 
 * @yields {Token}
 */
export function* tokenize(input) {
    var index = 0;
    /**
     * 
     * @param {TokenType} type 
     * @param {string | number} [value]
     * @returns {Token}
     */
    function makeToken(type, value) {
        return {
            type,
            at: index,
            value
        };
    }
    while(index < input.length) {
        // TODO: abstract out the valueless token parsing. Already had a mistake due to repetition
        if(input[index] === ' ' || input[index] === '\n') {
            index+=1;
        } else if(input[index] === '(') {
            yield makeToken('(');
            index+=1;
        } else if(input[index] === ')') {
            yield makeToken(')');
            index+=1;
        } else if(input.slice(index, index+2) === '&&') {
            yield makeToken('and');
            index+=2
        } else if(input.slice(index, index+2) === '||') {
            yield makeToken('or');
            index+=2
        } else if(input[index] === '!') {
            yield makeToken('not');
            index+=1
        } else if(input[index] === '=') {
            yield makeToken('equals');
            index+=1
        } else if(input[index] === '.') {
            yield makeToken('field access');
            index+=1
        } else if(input.slice(index, index+2) === '?.') {
            yield makeToken('nullable field access');
            index+=2
        } else if(input.slice(index, index+2) === '??') {
            yield makeToken('null coalescing');
            index+=2
        } else if(input.slice(index, index+4) === 'true') {
            yield makeToken('true');
            index+=4
        } else if(input.slice(index, index+5) === 'false') {
            yield makeToken('false');
            index+=5
        } else if(input.slice(index, index+4) === 'null') {
            yield makeToken('null');
            index+=4
        } else if(input.slice(index, index+9) === 'undefined') {
            yield makeToken('undefined');
            index+=9
        } else if(input[index] === '\'') {
            const [value, newIndex] = tokenizeString(input, index+1);
            yield makeToken('string', value);
            index = newIndex;
        } else if(input[index].match('[a-zA-Z]')) {
            const [name, newIndex] = tokenizeIdentifier(input, index);
            yield makeToken('identifier', name);
            index = newIndex;
        } else if(input[index].match('[0-9]')) {
            const [number, newIndex] = tokenizeNumber(input, index);
            yield makeToken('number', number);
            index = newIndex;
        } else {
            throw new Error(`Unexpected character '${input[index]}' at ${index}`);
        }
    }
}

function tokenizeString(input, index) {
    const startIndex = index;
    var value = '';
    var escapeNext = false;
    while(index < input.length) {
        const current = input[index];
        if(!escapeNext && current === '\'') {
            return [value, index+1];
        } else if(!escapeNext && current === '\\') {
            escapeNext = true;
            index+=1;
        } else {
            escapeNext = false;
            value += current;
            index +=1;
        }
    }
    throw new Error(`Unterminated string at ${startIndex}`);
}

function tokenizeIdentifier(input, index) {
    var name = '';
    while(index < input.length) {
        const current = input[index];
        if(current.match('[a-zA-Z0-9_]')) {
            name += current;
            index+=1
        } else {
            break;
        }
    }
    return [name, index];
}

function tokenizeNumber(input, index) {
    const startIndex = index;
    var number = '';
    var dotMatched = false;
    while(index < input.length) {
        const current = input[index];
        if(current.match('[0-9]')) {
            number += current;
            index+=1;
        } else if(current === '.') {
            if(dotMatched) {
                throw new Error(`Invalid number at ${startIndex} contains two dots`);
            }
            dotMatched = true;
            number += '.';
            index+=1;
        } else {
            break;
        }
    }
    return [+number, index];
}

/**
 * @typedef { 'identifier' | 'literal' | 'unary' | 'binary' | 'grouping' } NodeType
 */

/**
 * @typedef { Operator | string | number } NodeValue
 */

/**
 * @typedef {Object} Node
 * @property {NodeType} type
 * @property {NodeValue} [value]
 * @property {Node[]} children
 */

/**
 * 
 * @param {NodeType} type 
 * @param {NodeValue} [value]
 * @param {Node[]} [children=[]]
 * @returns {Node}
 */
function makeNode(type, value, children) {
    return {
        type,
        value,
        children: children ?? [],
    }
}

const Precedence = {
    None: 0,
    Or: 1,
    And: 2,
    Equality: 3,
    NullCoalescing: 4,
    Unary: 5,
    FieldAccess: 6,
    Primary: 7,
}

/**
 * 
 * @param {Generator<Token, void, unknown>} tokens Takes ownership of the generator
 * @returns {Node}
 */
export function parse(tokens) {
    const ctx = {
        tokens,
        previous: null,
        current: tokens.next().value,
    };
    return parsePrecedence(ctx, 1); // Always the biggest precedence
}

/**
 * @typedef {Object} ParserCtx
 * @property {Token} previous
 * @property {Token} current
 * @property {Generator<Token, void, unknown>} tokens
 */

/**
 * @param {ParserCtx} ctx 
 */
function advance(ctx) {
    ctx.previous = ctx.current;
    ctx.current = ctx.tokens.next().value;
}

/**
 * @param {ParserCtx} ctx
 * @param {TokenType} type 
 */
function consume(ctx, type) {
    if(ctx.current.type === type) {
        advance(ctx);
        return;
    }
    throw new Error(`Parsing error at ${ctx.current.at}. Expected ${type} found ${ctx.current.type}`);
}

/**
 * 
 * @param {ParserCtx} ctx 
 * @param {number} precedence 
 * @returns {Node}
 */
function parsePrecedence(ctx, precedence) {
    advance(ctx);
    const prefixRule = getRule(ctx.previous.type).prefix;
    if(!prefixRule) {
        throw new Error('Expected expression');
    }

    var previous = prefixRule(ctx);
    while(ctx.current && precedence <= getRule(ctx.current.type).precedence) {
        advance(ctx);
        const infixRule = getRule(ctx.previous.type).infix;
        previous = infixRule(ctx, previous);
    }
    return previous;
}

/**
 * @param {ParserCtx} ctx 
 * @returns {Node}
 */
function expression(ctx) {
    return parsePrecedence(ctx, 1); // Always the biggest precedence
}

/**
 * @param {ParserCtx} ctx
 * @returns {Node}
 */
function literal(ctx) {
    return makeNode('literal', ctx.previous.value);
}

/**
 * 
 * @param {any} value 
 * @returns {PrefixParse}
 */
function constant(value) {
    return () => {
        return makeNode('literal', value);
    }
}

/**
 * @param {ParserCtx} ctx
 * @returns {Node}
 */
function identifier(ctx) {
    return makeNode('identifier', ctx.previous.value);
}
/**
 * @param {ParserCtx} ctx
 * @returns {Node}
 */
function grouping(ctx) {
    const expr = expression(ctx);
    consume(ctx, ')');
    return makeNode('grouping', undefined, [expr]);
}

/**
 * 
 * @param {ParserCtx} ctx 
 * @returns {Node}
 */
function unary(ctx) {
    const operatorType = ctx.previous.type;

    const expr = parsePrecedence(ctx, Precedence.Unary);

    switch(operatorType) {
        case 'not':
            return makeNode('unary', 'not', [expr]);
        default:
            throw new Error('Unreachable');
    }
}

/**
 * 
 * @param {ParserCtx} ctx }
 * @param {Node} previous
 * @returns {Node}
 */
function binary(ctx, previous) {
    const operatorType = ctx.previous.type;
    const rule = getRule(operatorType);
    const expr = parsePrecedence(ctx, rule.precedence + 1);

    return makeNode('binary', operatorType, [previous, expr]);
}

/**
 * 
 * @param {ParserCtx} ctx }
 * @param {Node} previous
 * @returns {Node}
 */
function fieldAccess(ctx, previous) {
    const operatorType = ctx.previous.type;
    consume(ctx, 'identifier');
    const id = identifier(ctx);

    return makeNode('binary', operatorType, [previous, id]);
}

/**
 * @callback PrefixParse
 * @param {ParserCtx} ctx
 * @returns {Node}
 */

/**
 * @callback InfixParse
 * @param {ParserCtx} ctx
 * @param {Node} previous
 * @returns {Node}
 */

/**
 * @typedef {Object} ParseRule
 * @property {PrefixParse | null} prefix
 * @property {InfixParse | null} infix
 * @property {number} precedence
 */

/**
 * 
 * @param {PrefixParse | null} prefix 
 * @param {InfixParse | null} infix 
 * @param {number} precedence 
 * @returns {ParseRule}
 */
function makeRule(prefix, infix, precedence) {
    return {
        prefix, infix, precedence
    };
}

/**
 * @type {Record<TokenType, ParseRule>}
 */
const ParseRules = {    
//                                      Prefix                  Infix               Precedence
    '(': makeRule(                      grouping,               null,               Precedence.None),
    'number': makeRule(                 literal,                null,               Precedence.None),
    'string': makeRule(                 literal,                null,               Precedence.None),
    'identifier': makeRule(             identifier,             null,               Precedence.None),
    'not': makeRule(                    unary,                  null,               Precedence.Unary),
    'equals': makeRule(                 null,                   binary,             Precedence.Equality),
    'or': makeRule(                     null,                   binary,             Precedence.Or),
    'and': makeRule(                    null,                   binary,             Precedence.And),
    'field access': makeRule(           null,                   fieldAccess,        Precedence.FieldAccess),
    'nullable field access': makeRule(  null,                   fieldAccess,        Precedence.FieldAccess),
    'null coalescing': makeRule(        null,                   binary,             Precedence.NullCoalescing),
    'true': makeRule(                   constant(true),         null,               Precedence.None),
    'false': makeRule(                  constant(false),        null,               Precedence.None),
    'null': makeRule(                   constant(null),         null,               Precedence.None),
    'undefined': makeRule(              constant(undefined),    null,               Precedence.None),
}
const DefaultRule = makeRule(null, null, Precedence.None);

/**
 * 
 * @param {TokenType} type 
 * @returns {ParseRule}
 */
function getRule(type) {
    return ParseRules[type] ?? DefaultRule;
}

export class Executor {
    /**
     * 
     * @param {Object} executionContext This should be an object that contains any values that should be available to the expression evaluation
     */
    constructor(executionContext) {
        /**
         * @type {Object}
         * @public
         */
        this.executionContext = executionContext;
    }
    /**
     * 
     * @param {Node} program 
     */
    execute(program) {
        switch(program.type) {
            case 'literal':
                return this.literal(program);
            case 'grouping':
                return this.execute(program.children[0]);
            case 'unary':
                return this.unary(program);
            case 'binary':
                return this.binary(program);
            case 'identifier':
                return this.identifier(program);
        }
        throw new Error('Unreachable');
    }
    /**
     * 
     * @param {Node} node 
     */
    literal(node) {
        return node.value;
    }
    /**
     * 
     * @param {Node} node 
     */
    unary(node) {
        const val = this.execute(node.children[0]);
        switch(node.value) {
            case 'not':
                return !val;
        }
        throw new Error('Unreachable');
    }
    /**
     * 
     * @param {Node} node 
     */
    binary(node) {
        const val1 = this.execute(node.children[0]);
        if(node.value === 'field access' || node.value === 'nullable field access') {
            // second child should already be an identifier, as per parsing
            if(node.value === 'field access') {
                if(val1 === null || val1 === undefined) {
                    throw new Error('Cannot access property of null or undefined value');
                }
                return val1[node.children[1].value];
            } else {
                if(val1) {
                    return val1[node.children[1].value];
                } else {
                    return null;
                }
            }
        } else {
            const val2 = this.execute(node.children[1]);
            switch(node.value) {
                case 'equals':
                    return val1 === val2;
                case 'or':
                    return val1 || val2;
                case 'and':
                    return val1 && val2;
                case 'null coalescing':
                    return val1 ?? val2;
            }
        }
        throw new Error('Unreachable');
    }
    /**
     * 
     * @param {Node} node 
     */
    identifier(node) {
        return this.executionContext[node.value];
    }
}

/**
 * 
 * @param {string} input 
 * @returns {Node}
 */
export function programFromString(input) {
    return parse(tokenize(input));
}