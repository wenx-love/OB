'use strict';

const crypto = require('crypto');

function assertWellFormedString(s) {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) throw new Error('lone high surrogate');
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new Error('lone low surrogate');
    }
  }
}

function canon(value) {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertWellFormedString(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('unsafe or non-integer number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canon(v)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    for (const k of keys) assertWellFormedString(k);
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(value[k])).join(',') + '}';
  }
  throw new Error('unsupported canonical value: ' + typeof value);
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function sha256Canon(value) {
  return sha256Hex(canon(value));
}

function lineOf(record) {
  return canon(record) + '\n';
}

function lineBytes(record) {
  return Buffer.byteLength(lineOf(record), 'utf8');
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRel(p) {
  if (typeof p !== 'string' || p.length === 0) throw new Error('empty path');
  let s = p.replace(/\\/g, '/');
  s = s.replace(/\/+/g, '/');
  let prefix = '';
  let rest = s;
  if (s.startsWith('//')) {
    prefix = '//';
    rest = s.slice(2);
  } else if (s.startsWith('/')) {
    prefix = '/';
    rest = s.slice(1);
  } else if (/^[A-Za-z]:\//.test(s)) {
    prefix = s.slice(0, 2) + '/';
    rest = s.slice(3);
  }
  const out = [];
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) throw new Error('path escape');
      out.pop();
    } else {
      out.push(part);
    }
  }
  return prefix ? prefix + out.join('/') : out.join('/');
}

function isPathPrefix(parent, child) {
  const p = normalizeRel(parent).replace(/\/$/, '');
  const c = normalizeRel(child).replace(/\/$/, '');
  return c === p || c.startsWith(p + '/');
}

function sortedUnique(values) {
  return Array.from(new Set(values)).sort();
}

const EXPERIMENT_RESULT = Object.freeze({
  PASS: 0,
  FAILED: 1,
  BLOCKED: 2,
  NOT_REACHED: 3,
  NOT_RUN: 4,
  UNVERIFIED: 5,
});

const COMMAND_STATUS = Object.freeze({
  OK: 0,
  USAGE: 20,
  STATE_PENDING: 21,
  LOCKED: 22,
  INCONSISTENT: 23,
  ROLLBACK_FAILED: 24,
  BLOCKED_EXTERNAL: 25,
  INTERNAL: 26,
  PATH_CONFLICT: 27,
});

module.exports = {
  canon,
  sha256Hex,
  sha256Canon,
  lineOf,
  lineBytes,
  deepClone,
  normalizeRel,
  isPathPrefix,
  sortedUnique,
  EXPERIMENT_RESULT,
  COMMAND_STATUS,
};
