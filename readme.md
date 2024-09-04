Sample program:

```
import { programFromString, Executor } from './index.js'

// Sample input program.
const inputProgram = "data.type?.name = 'typename'";
// Parses the program into its executable form.
// This throws if there's an unexpected token or a syntax error.
const program = programFromString(inputProgram);
// Set up execution context.
const executor = new Executor({
    data: {
        type: {
            name: 'typename'
        },
    },
    foo: 25
});
// Executes the program, returns the resulting value from evaluating the expression.
// Throws if there's any error when executing the program.
const result = executor.execute(program);
console.log(result);
```