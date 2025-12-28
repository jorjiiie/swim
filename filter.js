// === Filter Language ===
// Predicate-based filter with S-expression syntax
// Examples:
//   drake                           → naive search (artist OR track contains "drake")
//   (artist "Drake")                → artist contains "Drake"
//   (and (artist drake) (year 2023))→ Drake songs from 2023
//   (year >= 2020)                  → everything from 2020 onwards
//   (or (artist drake) (artist kendrick)) → Drake or Kendrick

(function() {
  // === Tokenizer ===
  // Handles: parens, quoted strings, regex literals, and bare words
  function tokenize(input) {
    const tokens = [];
    let i = 0;

    while (i < input.length) {
      const ch = input[i];

      // Skip whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Parentheses
      if (ch === '(' || ch === ')') {
        tokens.push({ type: ch });
        i++;
        continue;
      }

      // Quoted string
      if (ch === '"') {
        let str = '';
        i++; // skip opening quote
        while (i < input.length && input[i] !== '"') {
          if (input[i] === '\\' && i + 1 < input.length) {
            str += input[i + 1];
            i += 2;
          } else {
            str += input[i];
            i++;
          }
        }
        i++; // skip closing quote
        tokens.push({ type: 'string', value: str, quoted: true });
        continue;
      }

      // Regex literal /pattern/flags
      if (ch === '/') {
        let pattern = '';
        i++; // skip opening slash
        while (i < input.length && input[i] !== '/') {
          if (input[i] === '\\' && i + 1 < input.length) {
            pattern += input[i] + input[i + 1];
            i += 2;
          } else {
            pattern += input[i];
            i++;
          }
        }
        i++; // skip closing slash
        // Collect flags
        let flags = '';
        while (i < input.length && /[gimsuy]/.test(input[i])) {
          flags += input[i];
          i++;
        }
        tokens.push({ type: 'regex', pattern, flags });
        continue;
      }

      // Operators (must check >= <= before > <)
      if (input.slice(i, i + 2) === '>=' || input.slice(i, i + 2) === '<=') {
        tokens.push({ type: 'op', value: input.slice(i, i + 2) });
        i += 2;
        continue;
      }
      if (ch === '>' || ch === '<' || ch === '=') {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }

      // Word (includes dates like 2023-01-15, globs like drake*)
      let word = '';
      while (i < input.length && !/[\s()"\/]/.test(input[i])) {
        word += input[i];
        i++;
      }
      if (word) {
        tokens.push({ type: 'word', value: word });
      }
    }

    return tokens;
  }

  // === Parser ===
  // Recursive descent parser for S-expressions
  function parse(query) {
    query = query.trim();
    if (!query) return null;

    const tokens = tokenize(query);
    let pos = 0;

    function peek() {
      return tokens[pos];
    }

    function consume(expectedType) {
      const tok = tokens[pos];
      if (expectedType && tok?.type !== expectedType) {
        throw new Error(`Expected ${expectedType}, got ${tok?.type}`);
      }
      pos++;
      return tok;
    }

    function parseExpr() {
      const tok = peek();

      // S-expression
      if (tok?.type === '(') {
        consume('(');
        const nameTok = consume('word');
        const name = nameTok.value.toLowerCase();

        let result;
        if (name === 'and' || name === 'or') {
          const children = [];
          while (peek()?.type !== ')') {
            children.push(parseExpr());
          }
          if (children.length === 0) {
            throw new Error(`${name} requires at least one argument`);
          }
          result = { type: name, children };
        } else if (name === 'not') {
          if (peek()?.type === ')') {
            throw new Error('not requires exactly one argument');
          }
          const child = parseExpr();
          if (peek()?.type !== ')') {
            throw new Error('not requires exactly one argument');
          }
          result = { type: 'not', child };
        } else {
          // Leaf predicate: field + value(s)
          result = parseLeaf(name);
        }

        consume(')');
        return result;
      }

      // Bare boolean predicates (is_podcast, is_track) without parens
      if (tok?.type === 'word') {
        const name = tok.value.toLowerCase();
        if (name === 'is_podcast' || name === 'is_track') {
          consume('word');
          return { type: 'boolean', field: name };
        }
      }

      // Bare value - shouldn't happen at top level in well-formed input
      throw new Error(`Unexpected token: ${JSON.stringify(tok)}`);
    }

    function parseLeaf(field) {
      const values = [];
      let op = null;

      while (peek() && peek().type !== ')') {
        const tok = peek();

        if (tok.type === 'op') {
          op = consume('op').value;
        } else if (tok.type === 'word' || tok.type === 'string' || tok.type === 'regex') {
          values.push(consume());
        } else {
          break;
        }
      }

      // Determine predicate type based on field and values
      // Boolean predicates (no values)
      if (field === 'is_podcast' || field === 'is_track') {
        if (values.length > 0 || op) {
          throw new Error(`${field} takes no arguments`);
        }
        return { type: 'boolean', field };
      }

      if (field === 'artist' || field === 'track') {
        // String match
        if (values.length === 0) {
          throw new Error(`${field} requires a value, e.g. (${field} "name")`);
        }
        if (values.length > 1) {
          throw new Error(`${field} takes only one value`);
        }
        return { type: 'match', field, pattern: toPattern(values[0]) };
      }

      if (field === 'year') {
        if (values.length === 0) {
          throw new Error('year requires a value, e.g. (year 2023) or (year >= 2020)');
        }
        if (op) {
          // Comparison: (year >= 2020)
          return { type: 'compare', field: 'year', op, value: parseInt(values[0].value) };
        } else if (values.length === 2) {
          // Range: (year 2020 2023)
          return { type: 'range', field: 'year', min: parseInt(values[0].value), max: parseInt(values[1].value) };
        } else {
          // Exact: (year 2023)
          return { type: 'compare', field: 'year', op: '=', value: parseInt(values[0].value) };
        }
      }

      if (field === 'date') {
        if (values.length === 0) {
          throw new Error('date requires a value, e.g. (date 2023-01-15)');
        }
        if (op) {
          // Comparison: (date >= 2023-01-15)
          return { type: 'compare', field: 'date', op, value: parseDate(values[0].value) };
        } else if (values.length === 2) {
          // Range: (date 2023-01-01 2023-03-31)
          return { type: 'range', field: 'date', min: parseDate(values[0].value), max: parseDate(values[1].value) };
        } else {
          // Exact date
          return { type: 'compare', field: 'date', op: '=', value: parseDate(values[0].value) };
        }
      }

      throw new Error(`Unknown field: ${field}. Valid fields: artist, track, year, date, is_track, is_podcast`);
    }

    // Check if this is a naive query (no parens at start)
    if (tokens.length > 0 && tokens[0].type !== '(') {
      // Naive query - treat entire input as substring search on artist OR track
      // Wrap in * for glob matching (substring)
      const text = query.trim();
      const pattern = toPattern({ type: 'word', value: `*${text}*` });
      return {
        type: 'or',
        children: [
          { type: 'match', field: 'artist', pattern: pattern },
          { type: 'match', field: 'track', pattern: pattern }
        ],
        _naiveQuery: text  // Store original for display
      };
    }

    return parseExpr();
  }

  // Wrap AST with is_track filter if it doesn't already have a podcast predicate
  function wrapWithTrackFilter(ast) {
    if (!ast) return ast;
    if (hasPodcastPredicate(ast)) return ast;

    return {
      type: 'and',
      children: [
        { type: 'boolean', field: 'is_track' },
        ast
      ],
      _wrappedForPodcastFilter: true  // Mark so describer can hide it
    };
  }

  // Convert token to pattern (string or RegExp)
  function toPattern(tok) {
    if (tok.type === 'regex') {
      return new RegExp(tok.pattern, tok.flags || 'i');
    }

    const val = tok.value;

    // Check for glob patterns (* or ?)
    if (/[*?]/.test(val)) {
      // Convert glob to regex
      let regex = val
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars except * ?
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp('^' + regex + '$', 'i');
    }

    // Plain string - case-insensitive exact match
    return { exact: true, value: val.toLowerCase() };
  }

  // Parse date string (YYYY-MM-DD)
  function parseDate(str) {
    const parts = str.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    throw new Error(`Invalid date format: ${str}`);
  }

  // === Compiler ===
  // Compile AST to predicate function (record => boolean)
  function compile(ast) {
    if (!ast) return () => true;

    switch (ast.type) {
      case 'and':
        const andPreds = ast.children.map(compile);
        return (r) => andPreds.every(p => p(r));

      case 'or':
        const orPreds = ast.children.map(compile);
        return (r) => orPreds.some(p => p(r));

      case 'not':
        const notPred = compile(ast.child);
        return (r) => !notPred(r);

      case 'match':
        return compileMatch(ast.field, ast.pattern);

      case 'compare':
        return compileCompare(ast.field, ast.op, ast.value);

      case 'range':
        return compileRange(ast.field, ast.min, ast.max);

      case 'boolean':
        return compileBoolean(ast.field);

      default:
        throw new Error(`Unknown AST node type: ${ast.type}`);
    }
  }

  function compileMatch(field, pattern) {
    return (r) => {
      const val = r[field];
      if (!val) return false;

      if (pattern instanceof RegExp) {
        return pattern.test(val);
      }

      if (pattern.exact) {
        // Exact match (case-insensitive)
        return val.toLowerCase() === pattern.value;
      }

      // String - case-insensitive substring (legacy)
      return val.toLowerCase().includes(pattern);
    };
  }

  function compileCompare(field, op, value) {
    return (r) => {
      let recordVal;
      if (field === 'year') {
        recordVal = r.ts?.getFullYear();
      } else if (field === 'date') {
        recordVal = r.ts;
      }

      if (recordVal == null) return false;

      switch (op) {
        case '=': return field === 'date'
          ? recordVal.toDateString() === value.toDateString()
          : recordVal === value;
        case '>': return recordVal > value;
        case '>=': return recordVal >= value;
        case '<': return recordVal < value;
        case '<=': return recordVal <= value;
        default: return false;
      }
    };
  }

  function compileRange(field, min, max) {
    return (r) => {
      let recordVal;
      if (field === 'year') {
        recordVal = r.ts?.getFullYear();
      } else if (field === 'date') {
        recordVal = r.ts;
      }

      if (recordVal == null) return false;
      return recordVal >= min && recordVal <= max;
    };
  }

  function compileBoolean(field) {
    return (r) => {
      if (field === 'is_podcast') {
        return r.isPodcast === true;
      } else if (field === 'is_track') {
        return r.isPodcast !== true;
      }
      return false;
    };
  }

  // === Describer ===
  // Convert AST to human-readable string for display
  function describe(ast) {
    if (!ast) return '';

    switch (ast.type) {
      case 'and':
        // Check for naive query (which has _naiveQuery set)
        if (ast._naiveQuery) {
          return `"${ast._naiveQuery}"`;
        }
        // Hide auto-wrapped is_track filter
        if (ast._wrappedForPodcastFilter) {
          return describe(ast.children[1]);
        }
        return ast.children.map(describe).join(' and ');

      case 'or':
        // Check for naive query
        if (ast._naiveQuery) {
          return `"${ast._naiveQuery}"`;
        }
        return '(' + ast.children.map(describe).join(' or ') + ')';

      case 'not':
        return `not ${describe(ast.child)}`;

      case 'match':
        const p = ast.pattern;
        let patternStr;
        if (p instanceof RegExp) {
          patternStr = `/${p.source}/${p.flags}`;
        } else if (p.exact) {
          patternStr = `"${p.value}"`;
        } else {
          patternStr = `"${p}"`;
        }
        return `${ast.field}:${patternStr}`;

      case 'compare':
        const valStr = ast.field === 'date'
          ? formatDate(ast.value)
          : ast.value;
        return ast.op === '='
          ? `${ast.field}:${valStr}`
          : `${ast.field}${ast.op}${valStr}`;

      case 'range':
        const minStr = ast.field === 'date' ? formatDate(ast.min) : ast.min;
        const maxStr = ast.field === 'date' ? formatDate(ast.max) : ast.max;
        return `${ast.field}:${minStr}–${maxStr}`;

      case 'boolean':
        if (ast.field === 'is_podcast') return 'podcasts';
        if (ast.field === 'is_track') return 'tracks';
        return ast.field;

      default:
        return '';
    }
  }

  function formatDate(d) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Check if AST contains any podcast-related predicate (is_podcast or is_track)
  function hasPodcastPredicate(ast) {
    if (!ast) return false;
    if (ast.type === 'boolean' && (ast.field === 'is_podcast' || ast.field === 'is_track')) {
      return true;
    }
    if (ast.children) {
      return ast.children.some(hasPodcastPredicate);
    }
    if (ast.child) {
      return hasPodcastPredicate(ast.child);
    }
    return false;
  }

  // === Public API ===
  window.swim = window.swim || {};
  window.swim.filter = {
    parse: parse,
    compile: compile,
    describe: describe,

    // Convenience: parse + compile
    // Automatically wraps with is_track filter if no podcast predicate present
    createFilter: function(query) {
      const rawAst = parse(query);
      const ast = wrapWithTrackFilter(rawAst);
      return {
        ast: ast,
        predicate: compile(ast),
        description: describe(ast)
      };
    }
  };
})();
