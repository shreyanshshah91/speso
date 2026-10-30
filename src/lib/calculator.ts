const TOKEN_RE = /(\d+\.?\d*|\.\d+|[+\-×÷])/g;

/** Evaluates a simple arithmetic expression typed on the amount keypad (+ - × ÷, standard precedence). */
export function evaluateExpression(expr: string): number | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;

  const tokens = trimmed.match(TOKEN_RE);
  if (!tokens || tokens.join('') !== trimmed.replace(/\s/g, '')) return null;

  // First pass: collapse × and ÷.
  const pass1: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '×' || token === '÷') {
      const prev = pass1.pop();
      const next = tokens[i + 1];
      if (prev === undefined || next === undefined) return null;
      const a = Number(prev);
      const b = Number(next);
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      pass1.push(String(token === '×' ? a * b : a / b));
      i += 2;
    } else {
      pass1.push(token);
      i++;
    }
  }

  // Second pass: apply + and -.
  let result = Number(pass1[0]);
  if (Number.isNaN(result)) return null;
  for (let j = 1; j < pass1.length; j += 2) {
    const op = pass1[j];
    const value = Number(pass1[j + 1]);
    if (Number.isNaN(value)) return null;
    if (op === '+') result += value;
    else if (op === '-') result -= value;
    else return null;
  }

  return Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
}

export function isOperator(char: string): boolean {
  return char === '+' || char === '-' || char === '×' || char === '÷';
}
