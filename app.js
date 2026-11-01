"use strict";

const VERSION = "0.2";

const term = document.getElementById("terminal");
const input = document.getElementById("input");
const fileInput = document.getElementById("file-input");
const editor = document.getElementById("editor");
const editorText = document.getElementById("editor-text");

const variables = {};
const history = [];
let historyIndex = 0;
let pending = null;
let filesAllowed = false;
const files = new Map();

const KNOWN_PROJECTS = {
    il2cppdumper: "Perfare/Il2CppDumper"
};

/* ---------- вывод ---------- */

function addLine(text, type = "output") {
    const line = document.createElement("div");
    line.className = "line " + type;
    line.textContent = String(text);
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + " байт";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ (" + bytes + " байт)";
    return (bytes / 1024 / 1024).toFixed(2) + " МБ (" + bytes + " байт)";
}

/* ---------- язык Dedrix ---------- */

const NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;

function splitTopLevel(text, separator) {
    const parts = [];
    let current = "";
    let quote = null;

    for (const ch of text) {
        if (quote) {
            current += ch;
            if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") {
            quote = ch;
            current += ch;
        } else if (ch === separator) {
            parts.push(current);
            current = "";
        } else {
            current += ch;
        }
    }

    parts.push(current);
    return parts;
}

function evaluateAtom(atom) {
    atom = atom.trim();

    if (/^"[^"]*"$/.test(atom) || /^'[^']*'$/.test(atom)) return atom.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(atom)) return Number(atom);
    if (atom.startsWith('"') || atom.startsWith("'")) throw new Error("Не закрыты кавычки: " + atom);
    if (Object.prototype.hasOwnProperty.call(variables, atom)) return variables[atom];

    throw new Error("Неизвестная переменная: " + atom);
}

function evaluateExpression(expression) {
    expression = expression.trim();
    if (!expression) return "";

    const parts = splitTopLevel(expression, "+");
    if (parts.length === 1) return evaluateAtom(parts[0]);

    const values = parts.map(evaluateAtom);
    if (values.every(v => typeof v === "number")) return values.reduce((a, b) => a + b, 0);
    return values.map(String).join("");
}

function executeDedrixLine(source) {
    const line = source.trim();
    if (!line || line.startsWith("//")) return;

    const output = line.match(/^(?:txt|текст)([123]?)\((.*)\)$/u);
    if (output) {
        const value = evaluateExpression(output[2]);
        addLine(value, output[1] ? "size" + output[1] : "output");
        return;
    }

    const assignment = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u);
    if (assignment && NAME.test(assignment[1])) {
        variables[assignment[1]] = evaluateExpression(assignment[2]);
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

/* ---------- файлы ---------- */

function readHead(file, count) {
    return file.slice(0, count).arrayBuffer().then(buffer => new Uint8Array(buffer));
}

function looksLikeText(bytes) {
    if (!bytes.length) return true;
    let bad = 0;
    for (const b of bytes) if (b < 9 || (b > 13 && b < 32)) bad++;
    return bad / bytes.length < 0.02;
}

function toHex(bytes) {
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" ").toUpperCase();
}

async function showPreview(file) {
    const head = await readHead(file, 400);

    if (looksLikeText(head)) {
        addLine(new TextDecoder("utf-8").decode(head) || "(пустой файл)", "preview");
    } else {
        addLine("HEX: " + toHex(head.slice(0, 48)), "preview");
    }
}

function addFiles(list) {
    for (const file of list) files.set(file.name, file);
}

fileInput.addEventListener("change", async () => {
    const chosen = Array.from(fileInput.files);
    fileInput.value = "";

    if (!chosen.length) {
        addLine("Файлы не выбраны.", "info");
        return;
    }

    addFiles(chosen);

    for (const file of chosen) {
        addLine(file.name + " — " + formatSize(file.size), "info");
        try {
            await showPreview(file);
        } catch (error) {
            addLine("Не удалось прочитать файл: " + error.message, "error");
        }
    }

    addLine("Подробности: view set -имя", "input");
});

function findFiles(query) {
    const q = query.trim().toLowerCase();
    const all = Array.from(files.values());

    const exact = all.filter(f => f.name.toLowerCase() === q);
    if (exact.length) return exact;

    const noExt = all.filter(f => f.name.toLowerCase().replace(/\.[^.]+$/, "") === q);
    if (noExt.length) return noExt;

    return all.filter(f => f.name.toLowerCase().includes(q));
}

async function viewSet(name) {
    if (!name) {
        if (!files.size) {
            addLine("Файлов нет. Сначала: file view", "error");
            return;
        }
        addLine("Файлы: " + Array.from(files.keys()).join(", "), "info");
        return;
    }

    const found = findFiles(name);

    if (!found.length) {
        addLine("Файл не найден: " + name + ". Сначала выбери его: file view", "error");
        return;
    }

    if (found.length > 1) {
        addLine("Подходит несколько файлов, уточни имя: " + found.map(f => f.name).join(", "), "error");
        return;
    }

    const file = found[0];
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "нет";
    const head = await readHead(file, 8);

    addLine(
        "Имя: " + file.name + "\n" +
        "Размер: " + formatSize(file.size) + "\n" +
        "Тип: " + (file.type || "неизвестен") + "\n" +
        "Расширение: " + ext + "\n" +
        "Изменён: " + new Date(file.lastModified).toLocaleString("ru-RU") + "\n" +
        "Первые байты: " + (toHex(head) || "нет"),
        "info"
    );
}

function fileView() {
    if (filesAllowed) {
        fileInput.click();
        return;
    }

    addLine("Do you allow the terminal to access files? (Y/N):", "prompt");

    pending = answer => {
        if (/^(y|yes|д|да)$/i.test(answer.trim())) {
            filesAllowed = true;
            fileInput.click();
        } else {
            addLine("Доступ к файлам запрещён.", "info");
        }
    };
}

/* ---------- загрузка с GitHub ---------- */

async function download(project, version) {
    const repo = project.includes("/") ? project : KNOWN_PROJECTS[project.toLowerCase()];

    if (!repo) {
        addLine("Проект «" + project + "» неизвестен. Напиши владелец/репозиторий.", "error");
        return;
    }

    const api = "https://api.github.com/repos/" + repo + "/releases/" +
        (version.toLowerCase() === "latest" ? "latest" : "tags/" + encodeURIComponent(version));

    addLine("Ищу " + repo + " (" + version + ")...", "info");

    try {
        const response = await fetch(api);

        if (response.status === 404) {
            addLine("Версия не найдена: " + version, "error");
            return;
        }
        if (!response.ok) throw new Error("GitHub ответил " + response.status);

        const release = await response.json();
        const assets = release.assets || [];

        addLine("Версия: " + release.tag_name, "info");

        if (!assets.length) {
            addLine("В этом релизе нет файлов для скачивания.", "error");
            return;
        }

        assets.forEach(asset => addLine("• " + asset.name + " — " + formatSize(asset.size) + "\n  " + asset.browser_download_url, "output"));

        const target = assets.find(a => /win/i.test(a.name)) || assets[0];
        addLine("Скачиваю: " + target.name, "info");

        const file = await fetch(target.browser_download_url);
        if (!file.ok) throw new Error("файл не скачался (" + file.status + ")");

        const blob = await file.blob();
        files.set(target.name, new File([blob], target.name, { type: blob.type }));

        addLine("Готово. Характеристики: view set -" + target.name, "info");
        addLine("Запуск дампера внутри терминала пока не поддерживается: нужен .NET.", "input");
    } catch (error) {
        addLine("Ошибка загрузки: " + error.message + ". Ссылки на файлы выше можно открыть вручную.", "error");
    }
}

/* ---------- команды терминала ---------- */

const HELP = [
    "help — справка",
    "clear — очистить терминал",
    "version — версия",
    "history — история команд",
    "edit — открыть редактор Dedrix",
    "run — запустить код из редактора",
    "file view — выбрать и посмотреть файл",
    "view set -имя — все характеристики файла",
    "download Il2CppDumper GitHub/version = latest — скачать релиз с GitHub",
    "",
    "Язык Dedrix:",
    'txt("Привет")  txt1/txt2/txt3 — крупный, средний, мелкий текст',
    'имя = значение  (числа и строки, + складывает или склеивает)',
    "// комментарий"
].join("\n");

function handleCommand(raw) {
    const cmd = raw.trim();
    if (!cmd) return;

    const low = cmd.toLowerCase();

    if (low === "help" || low === "помощь") return addLine(HELP, "info");
    if (low === "clear" || low === "очистить") { term.textContent = ""; return; }
    if (low === "version" || low === "версия") return addLine("Dedrix Terminal " + VERSION, "info");
    if (low === "history") return addLine(history.map((h, i) => (i + 1) + "  " + h).join("\n") || "История пуста.", "info");
    if (low === "edit") return openEditor();
    if (low === "run") return runEditor();
    if (low === "file view") return fileView();

    const view = cmd.match(/^view\s+set(?:\s+-?(.+))?$/i);
    if (view) return viewSet(view[1] || "");

    const dl = cmd.match(/^download\s+(\S+)\s+github\s*\/\s*version\s*=\s*(\S+)$/i)
        || (cmd.match(/^download\s+github\s+(\S+)\s+version\s*=\s*(\S+)$/i));
    if (dl) return download(dl[1], dl[2]);

    try {
        executeDedrixLine(cmd);
    } catch (error) {
        addLine(error.message, "error");
    }
}

/* ---------- редактор ---------- */

editorText.value = 'txt1("Привет! Это Dedrix.")\n\nимя = "Мой первый проект"\ntxt2(имя)\n\n// сложение\nx = 2 + 3\ntxt3(x)';

function openEditor() { editor.classList.add("open"); editorText.focus(); }
function closeEditor() { editor.classList.remove("open"); input.focus(); }

function runEditor() {
    if (!editorText.value.trim()) {
        addLine("Редактор пуст. Открой его командой edit.", "error");
        return;
    }
    runDedrix(editorText.value);
}

document.getElementById("editor-run").addEventListener("click", () => { closeEditor(); runEditor(); });
document.getElementById("editor-close").addEventListener("click", closeEditor);

/* ---------- ввод ---------- */

input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        const value = input.value;
        input.value = "";
        addLine("> " + value, "input");

        if (pending) {
            const handler = pending;
            pending = null;
            handler(value);
            return;
        }

        if (value.trim()) {
            history.push(value);
            historyIndex = history.length;
        }

        handleCommand(value);
    } else if (event.key === "ArrowUp" && history.length) {
        event.preventDefault();
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex];
    } else if (event.key === "ArrowDown" && history.length) {
        event.preventDefault();
        historyIndex = Math.min(history.length, historyIndex + 1);
        input.value = history[historyIndex] || "";
    }
});

term.addEventListener("click", () => {
    if (!window.getSelection().toString()) input.focus();
});

window.Dedrix = { run: runDedrix, execute: executeDedrixLine, variables };

addLine("Dedrix Terminal " + VERSION + " — напиши help", "info");
input.focus();
