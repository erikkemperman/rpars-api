import * as Koa from 'koa';

import * as querystring from 'querystring';
import { isArray } from 'util';

export const HEX_REX = /^[0-9a-f]+$/;

export function parse_query(str: string) {
  return querystring.parse(str);
}

export function stringify_query(obj: {}) {
  return querystring.stringify(obj);
}

export type ParameterType = 'string' | 'boolean' | 'number'
                          | 'string[]' | 'boolean[]' | 'number[]'

export function check_parameters(
    ctx: Koa.ParameterizedContext,
    required: {[key: string]: ParameterType}): boolean {
  const problems: string[] = [];
  for (let [key, typ] of Object.entries(required)) {
    let v = ctx.request.body[key];
    let t = typeof v;
    if (t === 'undefined') {
      problems.push(`missing ${key} param`);
      continue;
    }
    if (typ.substr(-2) == '[]') {
      if (!Array.isArray(v)) {
        problems.push(`${key} param must be ${typ}`);
        continue;
      }
      if (v.length > 0) {
        let atyp = typ.substr(0, typ.length-2);
        if (typeof(v[0]) !== atyp) {
          problems.push(`${key} param must be ${typ}`);
          continue;
        }
      }
    } else if (t !== typ) {
      problems.push(`${key} param must be ${typ}`);
    }
  }
  if (problems.length > 0) {
    ctx.response.status = 400;
    ctx.response.message = 'Bad request: ' + problems.join(', ');
    return false;
  }
  return true;
}