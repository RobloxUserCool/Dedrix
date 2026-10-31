const variables = {};

function addLine(text, type = "output") {
    const terminal = document.getElementById("terminal");

    const line = document.createElement("div");
    line.className = "line " + type;
    line.textContent = String(text);

    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function evaluateExpression(expression) {
    expression = expression.trim();

    if (
        (expression.startsWith('"') && expression.endsWith('"')) ||
        (expression.startsWith("'") && expression.endsWith("'"))
    ) {
        return expression.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(expression)) {
        return Number(expression);
    }

    if (Object.prototype.hasOwnProperty.call(variables, expression)) {
        return variables[expression];
    }

    throw new Error("Неизвестная переменная: " + expression);
}

function executeDedrixLine(source) {
    const line = source.trim();

    if (!line) return;

    const assignment = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);

    if (assignment) {
        const name = assignment[1];
        const value = evaluateExpression(assignment[2]);

        variables[name] = value;
        return;
    }

    const output = line.match(/^txt\((.*)\)$/);

    if (output) {
        const value = evaluateExpression(output[1]);
        addLine(value);
        return;
    }

    throw new Error("Неизвестная команда: " + line);
}

function runDedrix(source) {
    const lines = source.split("\n");

    for (let i = 0; i < lines.length; i++) {
        try {
            executeDedrixLine(lines[i]);
        } catch (error) {
            addLine("Строка " + (i + 1) + ": " + error.message, "error");
            break;
        }
    }
}

window.Dedrix = {
    run: runDedrix,
    execute: executeDedrixLine,
    variables
};
