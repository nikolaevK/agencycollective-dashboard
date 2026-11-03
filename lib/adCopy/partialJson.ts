/**
 * Tolerant parse of a JSON document that is still streaming in — pure,
 * client-safe. Returns the value of everything that's complete so far: an
 * unfinished string VALUE is kept (closed where it stands, so copy appears as
 * it's written); an unfinished key, number or literal is dropped back to the
 * last complete value. Open objects/arrays are closed. Returns undefined when
 * nothing usable has arrived yet.
 */

type Frame = { kind: "obj" | "arr"; expect: "key" | "colon" | "value" | "comma" };

function closers(stack: Frame[]): string {
  let out = "";
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i].kind === "obj" ? "}" : "]";
  return out;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parsePartialJson(text: string): unknown {
  const stack: Frame[] = [];
  // Last cut point where text.slice(0, safeEnd) + closers(safeStack) is valid JSON.
  let safeEnd = -1;
  let safeStack: Frame[] = [];

  let inString = false;
  let stringIsKey = false;
  let escape = false;
  let unicodeLeft = 0;
  let escapeStart = -1;
  let midToken = false;

  const markSafe = (end: number) => {
    safeEnd = end;
    safeStack = stack.map((f) => ({ ...f }));
  };
  const afterValue = (end: number) => {
    const top = stack[stack.length - 1];
    if (top) top.expect = "comma";
    markSafe(end);
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (unicodeLeft > 0) {
        unicodeLeft--;
        continue;
      }
      if (escape) {
        escape = false;
        if (ch === "u") unicodeLeft = 4;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        escapeStart = i;
        continue;
      }
      if (ch === '"') {
        inString = false;
        if (stringIsKey) {
          const top = stack[stack.length - 1];
          if (top) top.expect = "colon";
        } else {
          afterValue(i + 1);
        }
      }
      continue;
    }
    if (/\s/.test(ch)) continue;
    const top = stack[stack.length - 1];
    if (ch === "{" || ch === "[") {
      stack.push({ kind: ch === "{" ? "obj" : "arr", expect: ch === "{" ? "key" : "value" });
      markSafe(i + 1);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      afterValue(i + 1);
    } else if (ch === ",") {
      if (top) top.expect = top.kind === "obj" ? "key" : "value";
    } else if (ch === ":") {
      if (top) top.expect = "value";
    } else if (ch === '"') {
      inString = true;
      escape = false;
      unicodeLeft = 0;
      stringIsKey = top?.kind === "obj" && top.expect === "key";
    } else {
      // number / true / false / null — complete only once a delimiter follows.
      let j = i;
      while (j < text.length && !/[\s,\]}]/.test(text[j])) j++;
      if (j >= text.length) {
        midToken = true;
        break;
      }
      afterValue(j);
      i = j - 1;
    }
  }

  if (inString && !stringIsKey && !midToken) {
    let body = text;
    if (escape || unicodeLeft > 0) body = text.slice(0, escapeStart);
    const value = tryParse(body + '"' + closers(stack));
    if (value !== undefined) return value;
  }
  if (safeEnd < 0) return undefined;
  return tryParse(text.slice(0, safeEnd) + closers(safeStack));
}
