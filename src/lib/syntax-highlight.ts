/**
 * Phase D3 — tiny read-only tokenizer for the Study Canvas.
 *
 * Deliberately dependency-free: it only needs to colour Python and JavaScript
 * snippets that are displayed, never edited or executed. Tokens map to design
 * tokens (see `--code-*` in src/styles.css) so light/dark both work.
 */

export type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "builtin"
  | "function"
  | "punctuation";

export type Token = { kind: TokenKind; value: string };

const PY_KEYWORDS = new Set([
  "and","as","assert","async","await","break","class","continue","def","del","elif","else",
  "except","finally","for","from","global","if","import","in","is","lambda","nonlocal","not",
  "or","pass","raise","return","try","while","with","yield","True","False","None",
]);

const PY_BUILTINS = new Set([
  "print","len","range","str","int","float","bool","list","dict","set","tuple","enumerate",
  "zip","open","super","isinstance","RuntimeError","ValueError","TypeError","Exception","self",
]);

const JS_KEYWORDS = new Set([
  "await","async","break","case","catch","class","const","continue","default","delete","do",
  "else","export","extends","finally","for","from","function","if","import","in","instanceof",
  "let","new","of","return","static","super","switch","this","throw","try","typeof","var",
  "void","while","yield","true","false","null","undefined",
]);

const JS_BUILTINS = new Set([
  "console","Math","JSON","Object","Array","String","Number","Boolean","Promise","Map","Set",
  "Error","Date","document","window",
]);

const PUNCT = "{}()[];,.:+-*/%<>=!&|^~?";

/**
 * Tokenize a single line. Multi-line constructs (Python triple-quoted strings,
 * JS block comments) are tracked by the caller through `state`.
 */
export type LineState = { block: null | "py-doc" | "js-comment" };

export function tokenizeLine(
  line: string,
  language: "python" | "javascript",
  state: LineState,
): { tokens: Token[]; state: LineState } {
  const tokens: Token[] = [];
  const keywords = language === "python" ? PY_KEYWORDS : JS_KEYWORDS;
  const builtins = language === "python" ? PY_BUILTINS : JS_BUILTINS;
  let i = 0;
  let block = state.block;

  const push = (kind: TokenKind, value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind) last.value += value;
    else tokens.push({ kind, value });
  };

  // Continuation of a multi-line construct opened on a previous line.
  if (block === "py-doc") {
    const end = line.indexOf('"""');
    if (end === -1) return { tokens: [{ kind: "string", value: line }], state: { block } };
    push("string", line.slice(0, end + 3));
    i = end + 3;
    block = null;
  } else if (block === "js-comment") {
    const end = line.indexOf("*/");
    if (end === -1) return { tokens: [{ kind: "comment", value: line }], state: { block } };
    push("comment", line.slice(0, end + 2));
    i = end + 2;
    block = null;
  }

  while (i < line.length) {
    const ch = line[i]!;
    const rest = line.slice(i);

    // Comments
    if (language === "python" && ch === "#") {
      push("comment", rest);
      break;
    }
    if (language === "javascript" && rest.startsWith("//")) {
      push("comment", rest);
      break;
    }
    if (language === "javascript" && rest.startsWith("/*")) {
      const end = line.indexOf("*/", i + 2);
      if (end === -1) {
        push("comment", rest);
        block = "js-comment";
        break;
      }
      push("comment", line.slice(i, end + 2));
      i = end + 2;
      continue;
    }

    // Python triple-quoted strings
    if (language === "python" && rest.startsWith('"""')) {
      const end = line.indexOf('"""', i + 3);
      if (end === -1) {
        push("string", rest);
        block = "py-doc";
        break;
      }
      push("string", line.slice(i, end + 3));
      i = end + 3;
      continue;
    }

    // Single-line strings (and JS template literals, single-line only)
    if (ch === '"' || ch === "'" || (language === "javascript" && ch === "`")) {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "\\") {
          j += 2;
          continue;
        }
        if (line[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      push("string", line.slice(i, j));
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      const m = /^[0-9][0-9_.eExXa-fA-F]*/.exec(rest);
      const value = m ? m[0] : ch;
      push("number", value);
      i += value.length;
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      const m = /^[A-Za-z0-9_$]+/.exec(rest)!;
      const word = m[0];
      const after = line.slice(i + word.length).match(/^\s*\(/);
      if (keywords.has(word)) push("keyword", word);
      else if (builtins.has(word)) push("builtin", word);
      else if (after) push("function", word);
      else push("plain", word);
      i += word.length;
      continue;
    }

    if (PUNCT.includes(ch)) {
      push("punctuation", ch);
      i++;
      continue;
    }

    push("plain", ch);
    i++;
  }

  return { tokens, state: { block } };
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "text-foreground",
  comment: "text-code-comment italic",
  string: "text-code-string",
  number: "text-code-number",
  keyword: "text-code-keyword",
  builtin: "text-code-builtin",
  function: "text-code-function",
  punctuation: "text-muted-foreground",
};
