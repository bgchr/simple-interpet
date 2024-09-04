import { tokenize, parse, Executor } from './index.js'

const program = "data.type?.name = carlos";

const ast = parse(tokenize(program));

console.log(ast);

const executor = new Executor({
    data: {
        type: {
            name: 'carlos'
        },
    },
    carlos: 'carlos1'
});

const result = executor.execute(ast);
console.log(result);