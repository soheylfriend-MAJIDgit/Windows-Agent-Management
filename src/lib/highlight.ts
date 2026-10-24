/** هایلایت سینتکس پایتون بدون وابستگی؛ خروجی: خطوطی از توکن‌ها */

export interface Token {
  text: string;
  cls?: string;
}

const KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class", "continue",
  "def", "del", "elif", "else", "except", "finally", "for", "from", "global", "if", "import", "in",
  "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with",
  "yield", "match", "case",
]);

const BUILTINS = new Set([
  "print", "len", "range", "str", "int", "float", "bool", "list", "dict", "set", "tuple", "open",
  "input", "sum", "min", "max", "abs", "round", "sorted", "reversed", "enumerate", "zip", "map",
  "filter", "any", "all", "isinstance", "issubclass", "getattr", "setattr", "hasattr", "super",
  "object", "Exception", "BaseException", "ValueError", "TypeError", "KeyError", "IndexError",
  "RuntimeError", "OSError", "IOError", "StopIteration", "NotImplementedError", "AttributeError",
  "FileNotFoundError", "PermissionError", "TimeoutError", "UnicodeDecodeError", "UnicodeEncodeError",
  "ImportError", "ModuleNotFoundError", "ConnectionError", "BrokenPipeError", "bytes", "bytearray",
  "complex", "frozenset", "memoryview", "iter", "next", "format", "repr", "hash", "id", "dir",
  "vars", "globals", "locals", "eval", "exec", "compile", "__import__", "callable", "chr", "ord",
  "bin", "hex", "oct", "divmod", "pow", "slice", "property", "staticmethod", "classmethod",
  "exit", "quit", "self", "cls",
]);

const TOKEN_RE =
  /(#[^\n]*)|((?:[rRbBuUfF]{0,2})(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(@[A-Za-z_][\w.]*)|\b(0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?j?)\b|([A-Za-z_][\w]*)|(\r?\n)|([^\sA-Za-z_0-9]+)|(\s+)/g;

export function highlightPython(source: string): Token[][] {
  const lines: Token[][] = [[]];
  let expectDefName = false;
  let lastSignificant = "";
  let match: RegExpExecArray | null;

  const push = (text: string, cls?: string) => {
    if (!text) return;
    const parts = text.split("\n");
    parts.forEach((part, index) => {
      if (part) lines[lines.length - 1].push({ text: part.replace(/\r$/, ""), cls });
      if (index < parts.length - 1) lines.push([]);
    });
  };

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(source)) !== null) {
    const [full, comment, string, decorator, number, name, newline, op, space] = match;
    if (comment) {
      push(comment, "tok-com");
      lastSignificant = "comment";
      continue;
    }
    if (string) {
      push(string, "tok-str");
      lastSignificant = "string";
      expectDefName = false;
      continue;
    }
    if (decorator) {
      push(decorator, "tok-dec");
      lastSignificant = "decorator";
      continue;
    }
    if (number) {
      push(number, "tok-num");
      lastSignificant = "number";
      continue;
    }
    if (name) {
      let cls: string | undefined;
      if (KEYWORDS.has(name)) {
        cls = "tok-kw";
        if (name === "def" || name === "class") expectDefName = true;
      } else if (expectDefName) {
        cls = "tok-def";
        expectDefName = false;
      } else if (BUILTINS.has(name)) {
        cls = "tok-builtin";
      } else if (source[TOKEN_RE.lastIndex] === "(") {
        cls = "tok-fn";
      }
      push(name, cls);
      lastSignificant = name;
      continue;
    }
    if (newline) {
      lines.push([]);
      if (lastSignificant === "comment") expectDefName = false;
      continue;
    }
    if (op) {
      push(op, "tok-op");
      lastSignificant = "op";
      continue;
    }
    if (space) {
      push(space);
      continue;
    }
    push(full);
  }

  if (lines.length > 1 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }
  return lines;
}
