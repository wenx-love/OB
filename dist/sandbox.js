import { _ as _traverse, l as libExports$1, r as requireLib, g as getDefaultExportFromCjs, p as parseCode } from "./chunks/parser-BGlb7RAx.js";
import { k as analyzeCallDeterminism, l as isStaticValue, m as computeScriptHash, g as getScriptAst, b as findCallPathsAt, e as replacementParentProblem, n as literalTextOf } from "./chunks/__vite-browser-external-B2yVx1m_.js";
const traverse$3 = typeof _traverse === "function" ? _traverse : _traverse.default;
function detectDecoders(ast, code) {
  const decoders = [];
  const stringArrays = /* @__PURE__ */ new Map();
  for (const node of ast.program.body) {
    if (libExports$1.isVariableDeclaration(node) && node.declarations.length === 1) {
      const decl = node.declarations[0];
      if (libExports$1.isIdentifier(decl.id) && libExports$1.isArrayExpression(decl.init) && decl.init.elements.length >= 5 && decl.init.elements.every((e) => libExports$1.isStringLiteral(e))) {
        stringArrays.set(decl.id.name, {
          node,
          elements: decl.init.elements.map((e) => e.value)
        });
      }
    }
    if (libExports$1.isFunctionDeclaration(node) && node.id && node.body.body.length >= 1) {
      const lastStmt = node.body.body[node.body.body.length - 1];
      if (libExports$1.isReturnStatement(lastStmt) && libExports$1.isArrayExpression(lastStmt.argument) && lastStmt.argument.elements.length >= 5 && lastStmt.argument.elements.every((e) => libExports$1.isStringLiteral(e))) {
        stringArrays.set(node.id.name, {
          node,
          elements: lastStmt.argument.elements.map((e) => e.value)
        });
      }
    }
  }
  if (stringArrays.size === 0) return decoders;
  for (const [arrayName, arrayInfo] of stringArrays) {
    let rotateNode = null;
    let decoderNode = null;
    let decoderName = null;
    for (const node of ast.program.body) {
      if (node === arrayInfo.node) continue;
      if (libExports$1.isExpressionStatement(node) && libExports$1.isCallExpression(node.expression) && libExports$1.isFunctionExpression(node.expression.callee)) {
        const src = code.slice(node.start, node.end);
        if (src.includes("push") && src.includes("shift") && src.includes(arrayName)) {
          rotateNode = node;
          continue;
        }
      }
      if (libExports$1.isFunctionDeclaration(node) && node.id) {
        const src = code.slice(node.start, node.end);
        if (src.includes(arrayName) && node.params.length >= 1) {
          decoderNode = node;
          decoderName = node.id.name;
          break;
        }
      }
      if (libExports$1.isVariableDeclaration(node) && node.declarations.length === 1 && libExports$1.isIdentifier(node.declarations[0].id) && libExports$1.isFunctionExpression(node.declarations[0].init)) {
        const src = code.slice(node.start, node.end);
        if (src.includes(arrayName) && node.declarations[0].init.params.length >= 1) {
          decoderNode = node;
          decoderName = node.declarations[0].id.name;
          break;
        }
      }
    }
    if (!decoderName || !decoderNode) continue;
    const snippets = [];
    snippets.push(code.slice(arrayInfo.node.start, arrayInfo.node.end));
    if (rotateNode) snippets.push(code.slice(rotateNode.start, rotateNode.end));
    snippets.push(code.slice(decoderNode.start, decoderNode.end));
    const decoderSrc = code.slice(decoderNode.start, decoderNode.end);
    let algorithm = "unknown";
    if (decoderSrc.includes("atob") || decoderSrc.includes("charAt")) {
      algorithm = decoderSrc.includes("% 256") || decoderSrc.includes("charCodeAt") ? "rc4" : "base64";
    } else if (!decoderSrc.includes("atob") && !decoderSrc.includes("escape")) {
      algorithm = "none";
    }
    decoders.push({
      name: decoderName,
      arrayName,
      arrayNode: arrayInfo.node,
      rotateNode,
      decoderNode,
      decoderSource: snippets.join("\n"),
      algorithm
    });
  }
  return decoders;
}
async function buildDecoderMappings(decoder, ast, code, options) {
  const mappings = {};
  if (!options.sandboxEval) return mappings;
  const calls = /* @__PURE__ */ new Map();
  traverse$3(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!libExports$1.isIdentifier(callee) || callee.name !== decoder.name) return;
      const args = path.node.arguments;
      const staticArgs = [];
      let allStatic = true;
      for (const arg of args) {
        if (libExports$1.isNumericLiteral(arg)) {
          staticArgs.push(arg.value);
        } else if (libExports$1.isStringLiteral(arg)) {
          staticArgs.push(arg.value);
        } else if (libExports$1.isUnaryExpression(arg, { operator: "-" }) && libExports$1.isNumericLiteral(arg.argument)) {
          staticArgs.push(-arg.argument.value);
        } else {
          allStatic = false;
          break;
        }
      }
      if (!allStatic || staticArgs.length === 0) return;
      const callText = code.slice(path.node.start, path.node.end);
      calls.set(callText, { args: staticArgs });
    }
  });
  if (calls.size === 0) return mappings;
  const entries = [...calls.entries()];
  const batchSize = 200;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const evalLines = batch.map(([, { args }], idx) => {
      const argsStr = args.map((a) => typeof a === "string" ? JSON.stringify(a) : String(a)).join(",");
      return `try{__r[${idx}]=${decoder.name}(${argsStr})}catch(e){__r[${idx}]=null}`;
    });
    const evalCode = decoder.decoderSource + `
var __r=[];
` + evalLines.join(";\n") + `;
__r`;
    try {
      const results = await options.sandboxEval(evalCode);
      if (!Array.isArray(results)) continue;
      for (let j = 0; j < batch.length && j < results.length; j++) {
        const [callText] = batch[j];
        const val = results[j];
        if (typeof val === "string") {
          mappings[callText] = {
            callText,
            value: val,
            type: "string",
            confidence: "confirmed",
            source: "sandbox-eval"
          };
        } else if (typeof val === "number") {
          mappings[callText] = {
            callText,
            value: val,
            type: "number",
            confidence: "confirmed",
            source: "sandbox-eval"
          };
        }
      }
    } catch {
    }
  }
  return mappings;
}
const traverse$2 = typeof _traverse === "function" ? _traverse : _traverse.default;
function transformCalls(ast, code, decoders, mappings) {
  const transforms = [];
  let resolved = 0;
  let skipped = 0;
  traverse$2(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (!libExports$1.isIdentifier(callee)) return;
      const callText = code.slice(path.node.start, path.node.end);
      const mapping = mappings[callText];
      const isDecoderCall = decoders.some((d) => d.name === callee.name);
      if (!isDecoderCall && !mapping) return;
      if (isDecoderCall) {
        const result = analyzeCallDeterminism(path, decoders);
        if (!result.deterministic) {
          skipped++;
          return;
        }
      } else if (!path.node.arguments.every((a) => isStaticValue(a))) {
        return;
      }
      if (!mapping) {
        skipped++;
        return;
      }
      let replacement;
      switch (mapping.type) {
        case "string":
          replacement = libExports$1.stringLiteral(mapping.value);
          break;
        case "number":
          replacement = libExports$1.numericLiteral(mapping.value);
          break;
        case "boolean":
          replacement = libExports$1.booleanLiteral(mapping.value);
          break;
        default:
          skipped++;
          return;
      }
      const loc = path.node.loc?.start;
      transforms.push({
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
        original: callText,
        replaced: mapping.type === "string" ? JSON.stringify(mapping.value) : String(mapping.value),
        source: mapping.source
      });
      path.replaceWith(replacement);
      resolved++;
    }
  });
  return { transforms, resolved, skipped };
}
const traverse$1 = typeof _traverse === "function" ? _traverse : _traverse.default;
const RESERVED = /* @__PURE__ */ new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);
const VALID_IDENT = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
function transformComputedToStatic(ast) {
  const transforms = [];
  let count = 0;
  traverse$1(ast, {
    MemberExpression(path) {
      if (!path.node.computed) return;
      const prop = path.node.property;
      if (!libExports$1.isStringLiteral(prop)) return;
      if (!VALID_IDENT.test(prop.value)) return;
      if (RESERVED.has(prop.value)) return;
      const loc = path.node.loc?.start;
      transforms.push({
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
        original: `["${prop.value}"]`,
        replaced: `.${prop.value}`,
        source: "static-decoder"
      });
      path.node.computed = false;
      path.node.property = libExports$1.identifier(prop.value);
      count++;
    }
  });
  return { transforms, count };
}
function usesThis(node) {
  if (libExports$1.isThisExpression(node)) return true;
  for (const key of libExports$1.VISITOR_KEYS[node.type] || []) {
    const value = node[key];
    if (value === null || value === void 0) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && usesThis(child)) return true;
      }
    } else if (value && typeof value === "object") {
      if (usesThis(value)) return true;
    }
  }
  return false;
}
function inlineProxyFunctions(ast) {
  const transforms = [];
  let count = 0;
  const proxies = /* @__PURE__ */ new Map();
  function analyzeProxy(name, params, body) {
    if (body.body.length !== 1) return;
    const stmt = body.body[0];
    if (!libExports$1.isReturnStatement(stmt) || !stmt.argument) return;
    if (!params.every((p) => libExports$1.isIdentifier(p))) return;
    const paramNames = params.map((p) => p.name);
    const ret = stmt.argument;
    const hasThis = usesThis(body);
    if (libExports$1.isBinaryExpression(ret) || libExports$1.isLogicalExpression(ret)) {
      if (libExports$1.isIdentifier(ret.left) && libExports$1.isIdentifier(ret.right) && paramNames.includes(ret.left.name) && paramNames.includes(ret.right.name)) {
        if (hasThis) return;
        proxies.set(name, {
          type: libExports$1.isBinaryExpression(ret) ? "binary" : "logical",
          operator: ret.operator,
          paramCount: paramNames.length
        });
      }
      return;
    }
    if (libExports$1.isIdentifier(ret) && paramNames.length === 1 && ret.name === paramNames[0]) {
      if (hasThis) return;
      proxies.set(name, { type: "identity", paramCount: 1 });
      return;
    }
    if (libExports$1.isUnaryExpression(ret) && paramNames.length === 1 && libExports$1.isIdentifier(ret.argument) && ret.argument.name === paramNames[0]) {
      if (hasThis) return;
      proxies.set(name, { type: "unary", operator: ret.operator, paramCount: 1 });
      return;
    }
    if (libExports$1.isCallExpression(ret) && libExports$1.isIdentifier(ret.callee) && paramNames.includes(ret.callee.name)) {
      if (hasThis) return;
      proxies.set(name, { type: "call", paramCount: paramNames.length, usesThis: false });
      return;
    }
    if (libExports$1.isCallExpression(ret) && libExports$1.isMemberExpression(ret.callee)) {
      const argsValid = ret.arguments.every(
        (a) => libExports$1.isIdentifier(a) && paramNames.includes(a.name)
      );
      if (!argsValid) return;
      if (hasThis) return;
      proxies.set(name, {
        type: "member-call",
        paramCount: paramNames.length,
        targetIsMethod: true
        // 标记目标是方法调用
      });
      return;
    }
  }
  traverse$1(ast, {
    VariableDeclarator(path) {
      if (!libExports$1.isIdentifier(path.node.id)) return;
      const init = path.node.init;
      if (!libExports$1.isFunctionExpression(init)) return;
      analyzeProxy(path.node.id.name, init.params, init.body);
    },
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      analyzeProxy(path.node.id.name, path.node.params, path.node.body);
    }
  });
  if (proxies.size === 0) return { transforms, count };
  const inlinedNames = /* @__PURE__ */ new Set();
  traverse$1(ast, {
    CallExpression(path) {
      if (!libExports$1.isIdentifier(path.node.callee)) return;
      const fnName = path.node.callee.name;
      const info = proxies.get(fnName);
      if (!info) return;
      const args = path.node.arguments;
      if (args.some((a) => libExports$1.isSpreadElement(a))) return;
      const loc = path.node.loc?.start;
      if ((info.type === "binary" || info.type === "logical") && args.length >= 2) {
        const newNode = info.type === "binary" ? libExports$1.binaryExpression(info.operator, args[0], args[1]) : libExports$1.logicalExpression(info.operator, args[0], args[1]);
        transforms.push({
          line: loc?.line ?? 0,
          column: loc?.column ?? 0,
          original: `${fnName}(...)`,
          replaced: `... ${info.operator} ...`,
          source: "ast-transform"
        });
        path.replaceWith(newNode);
        inlinedNames.add(fnName);
        count++;
        return;
      }
      if (info.type === "identity" && args.length === 1) {
        transforms.push({
          line: loc?.line ?? 0,
          column: loc?.column ?? 0,
          original: `${fnName}(x)`,
          replaced: "x",
          source: "ast-transform"
        });
        path.replaceWith(args[0]);
        inlinedNames.add(fnName);
        count++;
        return;
      }
      if (info.type === "unary" && args.length === 1) {
        const newNode = libExports$1.unaryExpression(info.operator, args[0]);
        transforms.push({
          line: loc?.line ?? 0,
          column: loc?.column ?? 0,
          original: `${fnName}(x)`,
          replaced: `${info.operator}x`,
          source: "ast-transform"
        });
        path.replaceWith(newNode);
        inlinedNames.add(fnName);
        count++;
        return;
      }
      if (info.type === "call") {
        return;
      }
      if (info.type === "member-call") {
        return;
      }
    }
  });
  if (inlinedNames.size > 0) {
    const stillReferenced = /* @__PURE__ */ new Set();
    traverse$1(ast, {
      Identifier(path) {
        if (!inlinedNames.has(path.node.name)) return;
        if (path.parentPath.isFunctionDeclaration() && path.parentPath.node.id === path.node) return;
        if (path.parentPath.isVariableDeclarator() && path.parentPath.node.id === path.node) return;
        if (path.key === "key" || path.key === "property") return;
        stillReferenced.add(path.node.name);
      }
    });
    traverse$1(ast, {
      "FunctionDeclaration|VariableDeclarator"(path) {
        let fnName = null;
        if (path.isFunctionDeclaration() && path.node.id) {
          fnName = path.node.id.name;
        } else if (path.isVariableDeclarator() && libExports$1.isIdentifier(path.node.id)) {
          fnName = path.node.id.name;
        }
        if (!fnName || !inlinedNames.has(fnName)) return;
        if (stillReferenced.has(fnName)) return;
        transforms.push({
          line: path.node.loc?.start?.line ?? 0,
          column: path.node.loc?.start?.column ?? 0,
          original: `function ${fnName}`,
          replaced: "(removed dead proxy)",
          source: "ast-transform"
        });
        if (path.isFunctionDeclaration()) {
          path.remove();
        } else {
          const parent = path.parentPath;
          if (parent.isVariableDeclaration() && parent.node.declarations.length === 1) {
            parent.remove();
          } else {
            path.remove();
          }
        }
        count++;
      }
    });
  }
  return { transforms, count };
}
function inferObjectMappings(ast, manager) {
  const results = [];
  traverse$1(ast, {
    VariableDeclarator(path) {
      if (!libExports$1.isIdentifier(path.node.id)) return;
      if (!libExports$1.isObjectExpression(path.node.init)) return;
      if (path.node.init.properties.length !== 0) return;
      const objName = path.node.id.name;
      if (!/^_0x/.test(objName)) return;
      const binding = path.scope.getBinding(objName);
      if (!binding) return;
      const propMap = {};
      let parentObj = null;
      for (const refPath of binding.referencePaths) {
        const memberPath = refPath.parentPath;
        if (!memberPath || !memberPath.isMemberExpression()) continue;
        const assignPath = memberPath.parentPath;
        if (!assignPath || !assignPath.isAssignmentExpression({ operator: "=" })) continue;
        if (assignPath.node.left !== memberPath.node) continue;
        const prop = memberPath.node.property;
        let propName = null;
        if (libExports$1.isStringLiteral(prop)) {
          propName = prop.value;
        } else if (libExports$1.isIdentifier(prop) && !memberPath.node.computed) {
          propName = prop.name;
        }
        if (!propName) continue;
        const right = assignPath.node.right;
        if (libExports$1.isMemberExpression(right)) {
          const obj = right.object;
          const rProp = right.property;
          let objStr = null;
          let propStr = null;
          if (libExports$1.isIdentifier(obj)) objStr = obj.name;
          if (libExports$1.isStringLiteral(rProp)) propStr = rProp.value;
          else if (libExports$1.isIdentifier(rProp) && !right.computed) propStr = rProp.name;
          if (objStr && propStr) {
            propMap[propName] = `${objStr}.${propStr}`;
            if (!parentObj && isBuiltinObject(objStr)) {
              parentObj = objStr;
            }
          }
        }
      }
      if (Object.keys(propMap).length > 0) {
        const mapping = {
          obfuscatedName: objName,
          realName: parentObj || "unknown",
          confidence: parentObj ? "inferred" : "manual",
          properties: propMap
        };
        results.push(mapping);
        manager.setObject(objName, mapping);
      }
    }
  });
  return results;
}
const BUILTIN_OBJECTS = /* @__PURE__ */ new Set([
  "console",
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "Math",
  "JSON",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Date",
  "RegExp",
  "Promise",
  "Map",
  "Set",
  "Symbol",
  "Proxy",
  "Reflect",
  "Error",
  "TypeError",
  "RangeError",
  "Uint8Array",
  "ArrayBuffer",
  "DataView",
  "TextEncoder",
  "TextDecoder",
  "XMLHttpRequest",
  "fetch",
  "FormData",
  "URL",
  "URLSearchParams",
  "localStorage",
  "sessionStorage",
  "crypto",
  "performance",
  "setTimeout",
  "setInterval",
  "clearTimeout",
  "clearInterval",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "atob",
  "btoa",
  "encodeURIComponent",
  "decodeURIComponent",
  "encodeURI",
  "decodeURI"
]);
function isBuiltinObject(name) {
  return BUILTIN_OBJECTS.has(name);
}
function applyObjectMappings(ast, manager) {
  const transforms = [];
  let count = 0;
  const allMappings = manager.exportObjects();
  if (allMappings.length === 0) return { transforms, count };
  const objMap = /* @__PURE__ */ new Map();
  for (const m of allMappings) {
    if (m.confidence === "manual" && Object.keys(m.properties).length === 0) continue;
    objMap.set(m.obfuscatedName, m);
  }
  if (objMap.size === 0) return { transforms, count };
  traverse$1(ast, {
    MemberExpression(path) {
      const obj = path.node.object;
      if (!libExports$1.isIdentifier(obj)) return;
      const mapping = objMap.get(obj.name);
      if (!mapping) return;
      const binding = path.scope.getBinding(obj.name);
      if (!binding) return;
      if (binding.constantViolations.length > 0) return;
      const prop = path.node.property;
      let propName = null;
      if (libExports$1.isStringLiteral(prop) && path.node.computed) {
        propName = prop.value;
      } else if (libExports$1.isIdentifier(prop) && !path.node.computed) {
        propName = prop.name;
      }
      if (!propName) return;
      const realValue = mapping.properties[propName];
      if (!realValue) return;
      const dotIdx = realValue.indexOf(".");
      if (dotIdx === -1) return;
      const realObj = realValue.slice(0, dotIdx);
      const realProp = realValue.slice(dotIdx + 1);
      const parent = path.parentPath;
      if (parent && parent.isAssignmentExpression() && parent.node.left === path.node) {
        return;
      }
      const replacement = libExports$1.memberExpression(
        libExports$1.identifier(realObj),
        libExports$1.identifier(realProp),
        false
      );
      const loc = path.node.loc?.start;
      transforms.push({
        line: loc?.line ?? 0,
        column: loc?.column ?? 0,
        original: `${obj.name}.${propName}`,
        replaced: realValue,
        source: "ast-transform"
      });
      path.replaceWith(replacement);
      count++;
    }
  });
  return { transforms, count };
}
var libExports = requireLib();
const _generate = /* @__PURE__ */ getDefaultExportFromCjs(libExports);
const traverse = typeof _traverse === "function" ? _traverse : _traverse.default;
const generate$1 = typeof _generate === "function" ? _generate : _generate.default;
function rec(node, original, replaced) {
  return {
    line: node.loc?.start.line ?? 0,
    column: node.loc?.start.column ?? 0,
    original,
    replaced,
    source: "ast-transform"
  };
}
function deadCodeRemoval(ast) {
  const transforms = [];
  let count = 0;
  traverse(ast, {
    IfStatement(path) {
      const evaluated = path.get("test").evaluate();
      if (!evaluated.confident) return;
      if (evaluated.value) {
        const consequent = path.node.consequent;
        const r = rec(path.node, "if(true){...}", "(consequent kept)");
        if (libExports$1.isBlockStatement(consequent)) {
          path.replaceWithMultiple(consequent.body);
        } else {
          path.replaceWith(consequent);
        }
        transforms.push(r);
        count++;
      } else {
        const r = path.node.alternate ? rec(path.node, "if(false){...}else{...}", "(alternate kept)") : rec(path.node, "if(false){...}", "(removed)");
        if (path.node.alternate) {
          const alt = path.node.alternate;
          if (libExports$1.isBlockStatement(alt)) {
            path.replaceWithMultiple(alt.body);
          } else {
            path.replaceWith(alt);
          }
        } else {
          path.remove();
        }
        transforms.push(r);
        count++;
      }
    },
    WhileStatement(path) {
      const evaluated = path.get("test").evaluate();
      if (evaluated.confident && !evaluated.value) {
        transforms.push(rec(path.node, "while(false){...}", "(removed)"));
        path.remove();
        count++;
      }
    },
    ConditionalExpression(path) {
      const testResult = path.get("test").evaluate();
      if (!testResult.confident) return;
      if (testResult.value) {
        transforms.push(rec(path.node, "cond ? A : B", "A (truthy)"));
        path.replaceWith(path.node.consequent);
      } else {
        transforms.push(rec(path.node, "cond ? A : B", "B (falsy)"));
        path.replaceWith(path.node.alternate);
      }
      count++;
    }
  });
  return { count, transforms };
}
function booleanRestore(ast) {
  const transforms = [];
  let count = 0;
  traverse(ast, {
    UnaryExpression(path) {
      if (path.node.operator !== "!") return;
      const arg = path.node.argument;
      if (libExports$1.isNumericLiteral(arg, { value: 0 })) {
        transforms.push(rec(path.node, "!0", "true"));
        path.replaceWith(libExports$1.booleanLiteral(true));
        count++;
        return;
      }
      if (libExports$1.isNumericLiteral(arg, { value: 1 })) {
        transforms.push(rec(path.node, "!1", "false"));
        path.replaceWith(libExports$1.booleanLiteral(false));
        count++;
        return;
      }
      if (libExports$1.isArrayExpression(arg) && arg.elements.length === 0) {
        transforms.push(rec(path.node, "![]", "false"));
        path.replaceWith(libExports$1.booleanLiteral(false));
        count++;
        return;
      }
      if (libExports$1.isStringLiteral(arg) && arg.value === "") {
        transforms.push(rec(path.node, '!""', "true"));
        path.replaceWith(libExports$1.booleanLiteral(true));
        count++;
        return;
      }
      if (libExports$1.isUnaryExpression(arg, { operator: "!" })) {
        const inner = arg.argument;
        if (libExports$1.isArrayExpression(inner) && inner.elements.length === 0) {
          transforms.push(rec(path.node, "!![]", "true"));
          path.replaceWith(libExports$1.booleanLiteral(true));
          count++;
          return;
        }
        if (libExports$1.isNumericLiteral(inner, { value: 0 })) {
          transforms.push(rec(path.node, "!!0", "false"));
          path.replaceWith(libExports$1.booleanLiteral(false));
          count++;
          return;
        }
        if (libExports$1.isNumericLiteral(inner, { value: 1 })) {
          transforms.push(rec(path.node, "!!1", "true"));
          path.replaceWith(libExports$1.booleanLiteral(true));
          count++;
          return;
        }
        if (libExports$1.isStringLiteral(inner) && inner.value === "") {
          transforms.push(rec(path.node, '!!""', "false"));
          path.replaceWith(libExports$1.booleanLiteral(false));
          count++;
          return;
        }
        if (libExports$1.isStringLiteral(inner) && inner.value !== "") {
          transforms.push(rec(path.node, '!!"..."', "true"));
          path.replaceWith(libExports$1.booleanLiteral(true));
          count++;
          return;
        }
      }
    }
  });
  return { count, transforms };
}
function constantFolding(ast) {
  const transforms = [];
  let count = 0;
  traverse(ast, {
    BinaryExpression(path) {
      const result = path.evaluate();
      if (!result.confident) return;
      const val = result.value;
      let before;
      try {
        before = generate$1(path.node, { compact: true }).code;
      } catch {
        before = "(expression)";
      }
      if (typeof val === "string") {
        transforms.push(rec(path.node, before, JSON.stringify(val)));
        path.replaceWith(libExports$1.stringLiteral(val));
        count++;
      } else if (typeof val === "number" && Number.isFinite(val)) {
        transforms.push(rec(path.node, before, String(val)));
        if (val < 0) {
          path.replaceWith(libExports$1.unaryExpression("-", libExports$1.numericLiteral(-val)));
        } else {
          path.replaceWith(libExports$1.numericLiteral(val));
        }
        count++;
      } else if (typeof val === "boolean") {
        transforms.push(rec(path.node, before, String(val)));
        path.replaceWith(libExports$1.booleanLiteral(val));
        count++;
      }
    }
  });
  return { count, transforms };
}
function hexNumericRestore(ast) {
  const transforms = [];
  let count = 0;
  traverse(ast, {
    NumericLiteral(path) {
      const extra = path.node.extra;
      if (extra?.raw && /^0[xXoObB]/.test(extra.raw)) {
        transforms.push(rec(path.node, extra.raw, String(path.node.value)));
        delete path.node.extra;
        count++;
      }
    }
  });
  return { count, transforms };
}
function controlFlowRecovery(ast) {
  const transforms = [];
  let count = 0;
  traverse(ast, {
    WhileStatement(path) {
      const test = path.node.test;
      const isTruthy = libExports$1.isBooleanLiteral(test, { value: true }) || libExports$1.isUnaryExpression(test, { operator: "!" }) && libExports$1.isNumericLiteral(test.argument, { value: 0 }) || libExports$1.isNumericLiteral(test, { value: 1 });
      if (!isTruthy) return;
      const body = path.node.body;
      if (!libExports$1.isBlockStatement(body)) return;
      const switchStmt = body.body.find((s) => libExports$1.isSwitchStatement(s));
      if (!switchStmt) return;
      const disc = switchStmt.discriminant;
      if (!libExports$1.isMemberExpression(disc) || !libExports$1.isIdentifier(disc.object)) return;
      let indexIdent = null;
      if (libExports$1.isUpdateExpression(disc.property, { operator: "++" }) && libExports$1.isIdentifier(disc.property.argument)) {
        indexIdent = disc.property.argument;
      }
      if (!indexIdent) return;
      const arrayName = disc.object.name;
      const binding = path.scope.getBinding(arrayName);
      if (!binding) return;
      const declNode = binding.path.node;
      if (!libExports$1.isVariableDeclarator(declNode) || !declNode.init) return;
      const init = declNode.init;
      if (!libExports$1.isCallExpression(init) || !libExports$1.isMemberExpression(init.callee) || !libExports$1.isStringLiteral(init.callee.object) || !libExports$1.isIdentifier(init.callee.property, { name: "split" }) || init.arguments.length !== 1 || !libExports$1.isStringLiteral(init.arguments[0], { value: "|" })) {
        return;
      }
      const orderArray = init.callee.object.value.split("|");
      const caseMap = /* @__PURE__ */ new Map();
      for (const c of switchStmt.cases) {
        if (!c.test || !libExports$1.isStringLiteral(c.test)) continue;
        const stmts = c.consequent.filter((s) => !libExports$1.isContinueStatement(s) && !libExports$1.isBreakStatement(s));
        caseMap.set(c.test.value, stmts);
      }
      const orderedStmts = [];
      for (const key of orderArray) {
        const stmts = caseMap.get(key);
        if (stmts) orderedStmts.push(...stmts);
      }
      transforms.push(rec(
        path.node,
        `while(true){switch(${arrayName}[...]){${switchStmt.cases.length} cases}}`,
        `${orderedStmts.length} statements inlined`
      ));
      const arrayDeclPath = binding.path;
      const idxBinding = path.scope.getBinding(indexIdent.name);
      path.replaceWithMultiple(orderedStmts);
      try {
        if (arrayDeclPath.parentPath && libExports$1.isVariableDeclaration(arrayDeclPath.parentPath.node)) {
          if (arrayDeclPath.parentPath.node.declarations.length === 1) {
            arrayDeclPath.parentPath.remove();
          } else {
            arrayDeclPath.remove();
          }
        }
      } catch {
      }
      try {
        if (idxBinding?.path.parentPath && libExports$1.isVariableDeclaration(idxBinding.path.parentPath.node)) {
          if (idxBinding.path.parentPath.node.declarations.length === 1) {
            idxBinding.path.parentPath.remove();
          } else {
            idxBinding.path.remove();
          }
        }
      } catch {
      }
      count++;
    }
  });
  return { count, transforms };
}
function isInsideInfra(refPath, infraNames) {
  let current = refPath.parentPath;
  while (current) {
    const node = current.node;
    if (libExports$1.isFunctionDeclaration(node) && node.id && infraNames.has(node.id.name)) return true;
    if (libExports$1.isVariableDeclarator(node) && libExports$1.isIdentifier(node.id) && infraNames.has(node.id.name)) return true;
    if (libExports$1.isExpressionStatement(node) && libExports$1.isCallExpression(node.expression) && (libExports$1.isFunctionExpression(node.expression.callee) || libExports$1.isArrowFunctionExpression(node.expression.callee))) {
      if (node.expression.arguments.some((a) => libExports$1.isIdentifier(a) && infraNames.has(a.name))) return true;
    }
    current = current.parentPath;
  }
  return false;
}
function removeDeclPath(declPath) {
  if (libExports$1.isVariableDeclarator(declPath.node)) {
    const parent = declPath.parentPath;
    if (parent && libExports$1.isVariableDeclaration(parent.node) && parent.node.declarations.length === 1) {
      parent.remove();
    } else {
      declPath.remove();
    }
  } else {
    declPath.remove();
  }
}
function deadDecoderRemoval(ast, decoders) {
  const transforms = [];
  let count = 0;
  const infraNames = /* @__PURE__ */ new Set();
  for (const d of decoders) {
    infraNames.add(d.name);
    infraNames.add(d.arrayName);
  }
  traverse(ast, {
    Program(programPath) {
      programPath.scope.crawl();
      for (const decoder of decoders) {
        const fnBinding = programPath.scope.getBinding(decoder.name);
        if (fnBinding) {
          const hasExternal = fnBinding.referencePaths.some(
            (ref) => !isInsideInfra(ref, infraNames)
          );
          if (!hasExternal) {
            transforms.push(rec(fnBinding.path.node, `function ${decoder.name}`, "(removed)"));
            removeDeclPath(fnBinding.path);
            count++;
            programPath.scope.crawl();
          }
        }
        const bodyPaths = programPath.get("body");
        for (const stmtPath of bodyPaths) {
          if (!stmtPath.isExpressionStatement()) continue;
          const expr = stmtPath.node.expression;
          if (!libExports$1.isCallExpression(expr)) continue;
          if (!libExports$1.isFunctionExpression(expr.callee) && !libExports$1.isArrowFunctionExpression(expr.callee)) continue;
          if (expr.arguments.some((a) => libExports$1.isIdentifier(a, { name: decoder.arrayName }))) {
            transforms.push(rec(stmtPath.node, "(rotation IIFE)", "(removed)"));
            stmtPath.remove();
            count++;
            programPath.scope.crawl();
            break;
          }
        }
        const arrBinding = programPath.scope.getBinding(decoder.arrayName);
        if (arrBinding) {
          const hasExternal = arrBinding.referencePaths.some(
            (ref) => !isInsideInfra(ref, infraNames)
          );
          if (!hasExternal) {
            transforms.push(rec(arrBinding.path.node, `var ${decoder.arrayName}`, "(removed)"));
            removeDeclPath(arrBinding.path);
            count++;
            programPath.scope.crawl();
          }
        }
      }
      programPath.stop();
    }
  });
  return { count, transforms };
}
function identifierRename(ast) {
  const transforms = [];
  let count = 0;
  const OB_PATTERN = /^_0x[a-f0-9]{4,}/i;
  let funcCounter = 0;
  let varCounter = 0;
  let paramCounter = 0;
  const processed = /* @__PURE__ */ new WeakSet();
  traverse(ast, {
    Scope(path) {
      const names = Object.keys(path.scope.bindings);
      for (const name of names) {
        if (!OB_PATTERN.test(name)) continue;
        const binding = path.scope.getBinding(name);
        if (!binding) continue;
        if (processed.has(binding.path.node)) continue;
        processed.add(binding.path.node);
        let newName;
        const bNode = binding.path.node;
        if (libExports$1.isFunctionDeclaration(bNode) || libExports$1.isVariableDeclarator(bNode) && bNode.init && libExports$1.isFunctionExpression(bNode.init)) {
          newName = `func${++funcCounter}`;
        } else if (binding.kind === "param") {
          newName = `p${++paramCounter}`;
        } else {
          newName = `v${++varCounter}`;
        }
        transforms.push(rec(bNode, name, newName));
        path.scope.rename(name, newName);
        count++;
      }
    }
  });
  return { count, transforms };
}
class MappingManager {
  entries = /* @__PURE__ */ new Map();
  objects = /* @__PURE__ */ new Map();
  /** 添加或更新映射，高置信度覆盖低置信度 */
  set(key, entry) {
    const existing = this.entries.get(key);
    if (existing && confidenceRank(existing.confidence) >= confidenceRank(entry.confidence)) {
      return;
    }
    this.entries.set(key, entry);
  }
  get(key) {
    return this.entries.get(key);
  }
  has(key) {
    return this.entries.has(key);
  }
  /** 批量导入映射 */
  import(records) {
    for (const [key, entry] of Object.entries(records)) {
      this.set(key, entry);
    }
  }
  /** 导出为纯对象 */
  export() {
    return Object.fromEntries(this.entries);
  }
  get size() {
    return this.entries.size;
  }
  /** 对象映射（第二阶段） */
  setObject(name, mapping) {
    this.objects.set(name, mapping);
  }
  getObject(name) {
    return this.objects.get(name);
  }
  exportObjects() {
    return [...this.objects.values()];
  }
}
function confidenceRank(c) {
  switch (c) {
    case "confirmed":
      return 3;
    case "inferred":
      return 2;
    case "manual":
      return 1;
    default:
      return 0;
  }
}
const generate = typeof _generate === "function" ? _generate : _generate.default;
function generateCode(ast, options = {}) {
  const { comments = true, indent = "  " } = options;
  const result = generate(ast, {
    comments,
    jsescOption: { minimal: true },
    retainLines: false,
    compact: false
  });
  return result.code;
}
const MAX_PASSES = 10;
async function recover(code, options = {}) {
  const t0 = performance.now();
  const manager = new MappingManager();
  const allTransforms = [];
  if (options.externalMappings) {
    manager.import(options.externalMappings);
  }
  const ast = parseCode(code);
  const decoders = detectDecoders(ast, code);
  if (options.useSandbox !== false) {
    for (const decoder of decoders) {
      const decoderMappings = await buildDecoderMappings(decoder, ast, code, options);
      manager.import(decoderMappings);
    }
  }
  const callResult = transformCalls(ast, code, decoders, manager.export());
  allTransforms.push(...callResult.transforms);
  let passes = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let passCount = 0;
    const dcr = deadCodeRemoval(ast);
    allTransforms.push(...dcr.transforms);
    passCount += dcr.count;
    const br = booleanRestore(ast);
    allTransforms.push(...br.transforms);
    passCount += br.count;
    const cf = constantFolding(ast);
    allTransforms.push(...cf.transforms);
    passCount += cf.count;
    const hnr = hexNumericRestore(ast);
    allTransforms.push(...hnr.transforms);
    passCount += hnr.count;
    const cfr = controlFlowRecovery(ast);
    allTransforms.push(...cfr.transforms);
    passCount += cfr.count;
    const proxy = inlineProxyFunctions(ast);
    allTransforms.push(...proxy.transforms);
    passCount += proxy.count;
    if (options.enableObjectMapping) {
      inferObjectMappings(ast, manager);
      const objReplace = applyObjectMappings(ast, manager);
      allTransforms.push(...objReplace.transforms);
      passCount += objReplace.count;
    }
    const member = transformComputedToStatic(ast);
    allTransforms.push(...member.transforms);
    passCount += member.count;
    passes++;
    if (passCount === 0) break;
  }
  const ddr = deadDecoderRemoval(ast, decoders);
  allTransforms.push(...ddr.transforms);
  const ir = identifierRename(ast);
  allTransforms.push(...ir.transforms);
  const outputCode = generateCode(ast);
  return {
    code: outputCode,
    transforms: allTransforms,
    mappings: manager.export(),
    objectMappings: manager.exportObjects(),
    decoders,
    stats: {
      totalCalls: callResult.resolved + callResult.skipped,
      resolvedCalls: allTransforms.length,
      skippedCalls: callResult.skipped,
      timeTaken: performance.now() - t0,
      passes
    }
  };
}
function rejectionOf(c, reasons) {
  return { scriptId: c.scriptId, groupId: c.groupId, position: c.position, callText: c.callText, reasons };
}
async function applyVerifiedReplacements(dryRunResult, script) {
  const rejected = [];
  const candidates = dryRunResult.candidates;
  const unchanged = () => ({ code: script.source, applied: [], rejected, stats: buildStats([], rejected) });
  if (candidates.length === 0) return unchanged();
  const truncatedGroups = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    if (c.callLocationsTruncated !== false) truncatedGroups.add(c.groupId);
  }
  const notTruncated = [];
  for (const c of candidates) {
    if (truncatedGroups.has(c.groupId)) {
      rejected.push(rejectionOf(c, [{ code: "call-locations-truncated", message: "该函数的调用位置列表被截断（或标记缺失），无法确认所有调用点，整组拒绝" }]));
    } else {
      notTruncated.push(c);
    }
  }
  if (notTruncated.length === 0) return unchanged();
  const currentHash = await computeScriptHash(script.source);
  const identityOk = [];
  for (const c of notTruncated) {
    if (c.scriptId !== script.scriptId) {
      rejected.push(rejectionOf(c, [{ code: "script-id-mismatch", message: `脚本 ID 不匹配：候选 ${c.scriptId} vs 当前 ${script.scriptId}` }]));
      continue;
    }
    if (c.scriptHash !== currentHash) {
      rejected.push(rejectionOf(c, [{ code: "script-version-mismatch", message: "脚本版本不匹配：源码已变化" }]));
      continue;
    }
    identityOk.push(c);
  }
  if (identityOk.length === 0) return unchanged();
  const intervals = validateIntervals(identityOk, script.source.length);
  rejected.push(...intervals.rejected);
  if (intervals.valid.length === 0) return unchanged();
  const located = validateASTPositions(intervals.valid, script);
  rejected.push(...located.rejected);
  if (located.valid.length === 0) return unchanged();
  const literals = validateLiterals(located.valid, script.source);
  rejected.push(...literals.rejected);
  if (literals.valid.length === 0) return unchanged();
  const sorted = [...literals.valid].sort((a, b) => b.start - a.start);
  const done = [];
  try {
    let modified = script.source;
    for (const c of sorted) {
      let text;
      try {
        text = generateLiteral(c.value);
      } catch (err) {
        rejected.push(rejectionOf(c, [{ code: "literal-generation-failed", message: `字面量生成失败: ${err}` }]));
        continue;
      }
      const original = modified.slice(c.start, c.end);
      modified = modified.slice(0, c.start) + text + modified.slice(c.end);
      done.push({ candidate: c, record: { scriptId: c.scriptId, groupId: c.groupId, position: c.position, original, replaced: text, start: c.start, end: c.end } });
    }
    try {
      parseCode(modified);
    } catch (parseErr) {
      const all = [
        ...rejected,
        ...done.map((d) => rejectionOf(d.candidate, [{ code: "parse-failed-after-replacement", message: `替换后代码解析失败，整体回滚：${parseErr}` }]))
      ];
      return { code: script.source, applied: [], rejected: all, stats: buildStats([], all) };
    }
    const applied = done.map((d) => d.record).reverse();
    return { code: modified, applied, rejected, stats: buildStats(applied, rejected) };
  } catch (err) {
    const all = [
      ...rejected,
      { scriptId: script.scriptId, groupId: "", position: { lineNumber: -1, columnNumber: -1 }, callText: "", reasons: [{ code: "replacement-failed", message: `替换过程异常: ${err}` }] }
    ];
    return { code: script.source, applied: [], rejected: all, stats: buildStats([], all) };
  }
}
function validateIntervals(candidates, sourceLength) {
  const wellFormed = [];
  const rejected = [];
  for (const c of candidates) {
    const reasons = [];
    if (!Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start >= c.end) {
      reasons.push({ code: "invalid-interval", message: `区间无效: start(${c.start}) 与 end(${c.end}) 不是 start < end 的整数` });
    }
    if (c.start < 0 || c.end > sourceLength) {
      reasons.push({ code: "interval-out-of-range", message: `区间超出源码范围: [${c.start}, ${c.end}) vs [0, ${sourceLength})` });
    }
    if (reasons.length > 0) rejected.push(rejectionOf(c, reasons));
    else wellFormed.push(c);
  }
  const sorted = [...wellFormed].sort((a, b) => a.start - b.start || a.end - b.end);
  const clusters = [];
  let clusterEnd = -1;
  for (const c of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && c.start < clusterEnd) {
      last.push(c);
      clusterEnd = Math.max(clusterEnd, c.end);
    } else {
      clusters.push([c]);
      clusterEnd = c.end;
    }
  }
  const valid = [];
  for (const cluster of clusters) {
    if (cluster.length === 1) {
      valid.push(cluster[0]);
    } else {
      for (const c of cluster) {
        rejected.push(rejectionOf(c, [{ code: "interval-overlapping", message: "区间与其他候选重叠或嵌套，重叠簇内的候选全部拒绝" }]));
      }
    }
  }
  return { valid, rejected };
}
function validateASTPositions(candidates, script) {
  const valid = [];
  const rejected = [];
  const { ast } = getScriptAst(script);
  if (!ast) {
    return { valid: [], rejected: candidates.map((c) => rejectionOf(c, [{ code: "ast-unavailable", message: "AST 不可用" }])) };
  }
  for (const c of candidates) {
    if (script.source.slice(c.start, c.end) !== c.callText) {
      rejected.push(rejectionOf(c, [{ code: "source-text-mismatch", message: `候选的 callText 与当前源码 [${c.start}, ${c.end}) 处的文本不一致` }]));
      continue;
    }
    const hits = findCallPathsAt(ast, c.position);
    if (hits.length === 0) {
      rejected.push(rejectionOf(c, [{ code: "ast-position-not-found", message: "AST 定位失败：该位置没有 CallExpression" }]));
    } else if (hits.length > 1) {
      rejected.push(rejectionOf(c, [{ code: "ast-position-ambiguous", message: "AST 定位不唯一：该位置有多个 CallExpression" }]));
    } else {
      const hit = hits[0];
      const node = hit.path.node;
      if (hit.kind !== "call-start" || node.start !== c.start || node.end !== c.end) {
        rejected.push(rejectionOf(c, [{ code: "ast-range-mismatch", message: `AST 节点范围 [${node.start}, ${node.end}) 与候选区间 [${c.start}, ${c.end}) 不一致，或位置不是调用表达式的起点` }]));
      } else {
        const parentProblem = replacementParentProblem(node, hit.path.parent, c.value);
        if (parentProblem) rejected.push(rejectionOf(c, [parentProblem]));
        else valid.push(c);
      }
    }
  }
  return { valid, rejected };
}
function validateLiterals(candidates, source) {
  const valid = [];
  const rejected = [];
  for (const c of candidates) {
    const v = c.value;
    let problem = null;
    let text = "";
    if (typeof v === "number") {
      if (!Number.isFinite(v) || v < 0 || Object.is(v, -0)) {
        problem = { code: "unsupported-literal-value", message: `数字 ${String(v)} 不是有限非负数字，生成的不是普通字面量，不替换` };
      }
    } else if (typeof v !== "string" && typeof v !== "boolean" && v !== null) {
      problem = { code: "unsupported-literal-value", message: `值类型 ${typeof v} 不能表示为字面量` };
    }
    if (!problem) {
      try {
        text = generateLiteral(c.value);
      } catch (err) {
        problem = { code: "literal-generation-failed", message: `字面量生成失败: ${err}` };
      }
    }
    if (!problem && typeof v !== "string") {
      const next = source.charAt(c.end);
      if (next !== "" && /[A-Za-z0-9_$\u0080-\uffff]/.test(next)) {
        problem = { code: "token-boundary", message: `字面量 ${text} 后面紧跟 ${next}，替换会把两者连成一个词法单元，改变语义或造成语法错误` };
      } else if (next === "." && /^[0-9]+$/.test(text)) {
        problem = { code: "numeric-member-access", message: `整数字面量 ${text} 后面紧跟 .，会被解析成小数点，造成语法错误` };
      }
    }
    if (!problem && c.replacement !== literalTextOf(c.value)) {
      problem = { code: "replacement-value-mismatch", message: `候选的 replacement（${JSON.stringify(c.replacement)}）与 value 按生成公式得到的字面量不一致：候选自相矛盾，可能被修改过，不替换` };
    }
    if (problem) rejected.push(rejectionOf(c, [problem]));
    else valid.push(c);
  }
  return { valid, rejected };
}
function generateLiteral(value) {
  const node = libExports$1.valueToNode(value);
  const result = libExports.generate(node, { concise: true });
  return result.code;
}
function buildStats(applied, rejected) {
  const byReason = {};
  for (const r of rejected) {
    for (const reason of r.reasons) {
      byReason[reason.code] = (byReason[reason.code] || 0) + 1;
    }
  }
  return {
    total: applied.length + rejected.length,
    applied: applied.length,
    rejected: rejected.length,
    byReason
  };
}
async function sandboxEval(code) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    try {
      const win = iframe.contentWindow;
      if (!win) throw new Error("Cannot access iframe contentWindow");
      win.atob = atob;
      win.btoa = btoa;
      win.decodeURIComponent = decodeURIComponent;
      win.encodeURIComponent = encodeURIComponent;
      win.decodeURI = decodeURI;
      win.encodeURI = encodeURI;
      win.escape = escape;
      win.unescape = unescape;
      win.parseInt = parseInt;
      win.parseFloat = parseFloat;
      win.isNaN = isNaN;
      win.isFinite = isFinite;
      win.String = String;
      win.Number = Number;
      win.Boolean = Boolean;
      win.Array = Array;
      win.Object = Object;
      win.Math = Math;
      win.Date = Date;
      win.RegExp = RegExp;
      win.JSON = JSON;
      win.Map = Map;
      win.Set = Set;
      win.Error = Error;
      win.TypeError = TypeError;
      win.RangeError = RangeError;
      win.Uint8Array = Uint8Array;
      win.ArrayBuffer = ArrayBuffer;
      win.TextEncoder = TextEncoder;
      win.TextDecoder = TextDecoder;
      win.console = { log() {
      }, warn() {
      }, error() {
      }, info() {
      }, debug() {
      }, trace() {
      }, dir() {
      }, table() {
      } };
      const result = win.eval(code);
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(iframe);
    }
  });
}
window.addEventListener("message", async (event) => {
  const { method, params } = event.data || {};
  const port = event.ports?.[0];
  if (!port || !method) return;
  try {
    if (method === "recover") {
      const opts = {
        useSandbox: true,
        sandboxEval,
        enableObjectMapping: true
      };
      if (params.externalMappings) {
        opts.externalMappings = params.externalMappings;
      }
      const result = await recover(params.code, opts);
      port.postMessage({ result });
    } else if (method === "format") {
      const ast = parseCode(params.code);
      const formatted = generateCode(ast, { indent: "    " });
      port.postMessage({ result: { code: formatted } });
    } else if (method === "apply-verified") {
      const dryRunResult = params.dryRunResult;
      const script = params.script;
      const result = await applyVerifiedReplacements(dryRunResult, script);
      port.postMessage({ result });
    } else {
      throw new Error(`Unknown method: ${method}`);
    }
  } catch (err) {
    port.postMessage({ error: err.message });
  }
});
window.parent.postMessage({ type: "sandbox-ready" }, "*");
