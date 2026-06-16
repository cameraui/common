import type { AudioCodec } from '@camera.ui/sdk';

export type Customizer<TSource, TTarget> = (objValue: any, srcValue: any, key: string | number | undefined, object: TSource, source: TTarget, stack: any[]) => any;

export function mergeWith<TSource, TTarget>(
  sourceObject: TSource,
  targetObject?: TTarget,
  customizer?: Customizer<TSource, TTarget>,
  stack: any[] = [],
): TSource & TTarget {
  if (Array.isArray(sourceObject) && Array.isArray(targetObject)) {
    const customizedValue = customizer ? customizer(sourceObject, targetObject, undefined, sourceObject, targetObject, stack) : undefined;
    if (customizedValue !== undefined) {
      return customizedValue;
    }
    return [...sourceObject, ...targetObject] as any;
  }

  if (typeof targetObject !== 'object') {
    return sourceObject as TTarget & TSource;
  }

  for (const key in targetObject) {
    if (Object.prototype.hasOwnProperty.call(targetObject, key)) {
      const objValue = (sourceObject as any)[key];
      const srcValue = (targetObject as any)[key];

      stack.push({ key, sourceObject, targetObject });

      const customizedValue = customizer ? customizer(objValue, srcValue, key, sourceObject, targetObject, stack) : undefined;

      if (customizedValue !== undefined) {
        (sourceObject as any)[key] = customizedValue;
      } else if (Array.isArray(objValue) && Array.isArray(srcValue)) {
        (sourceObject as any)[key] = [...objValue, ...srcValue];
      } else if (typeof objValue === 'object' && objValue !== null && typeof srcValue === 'object' && srcValue !== null) {
        (sourceObject as any)[key] = mergeWith({ ...(objValue as object) } as any, srcValue, customizer, stack);
      } else {
        (sourceObject as any)[key] = srcValue;
      }

      stack.pop();
    }
  }

  return sourceObject as TTarget & TSource;
}

export async function PromiseTimeout<T>(promise: Promise<T> | (() => Promise<T>), ms: number, cleanup?: () => void, errorMessage?: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      cleanup?.();
      reject(new Error(errorMessage ?? `Operation timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const promiseFn = typeof promise === 'function' ? promise : () => promise;
    return await Promise.race([promiseFn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

// prettier-ignore
export async function *AsyncGeneratorTimeout<T>(generator: AsyncGenerator<T>, ms: number, cleanup?: () => void, errorMessage?: string): AsyncGenerator<T> {
  while (true) {
    const nextValue = await PromiseTimeout(generator.next(), ms, cleanup, errorMessage);
    if (nextValue.done) break;
    yield nextValue.value;
  }
}

export function toQuery(data: any): string {
  let query = '';

  if (typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data)) {
      if (query === '') {
        query += `?${key}=${value}`;
      } else {
        query += `&${key}=${value}`;
      }
    }
  }

  return query;
}

export function toData(query: string): Record<string, any> {
  const params = new URLSearchParams(query);
  const result: Record<string, any> = {};

  params.forEach((value, key) => {
    if (value === 'true' || value === 'false' || value === '') {
      result[key] = value === 'true' || value === '';
    } else if (value === 'null') {
      result[key] = null;
    } else if (value === 'undefined') {
      result[key] = undefined;
    } else if (!isNaN(Number(value))) {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  });

  return result;
}

export function isJson(str: any): boolean {
  try {
    JSON.parse(str);
  } catch {
    return false;
  }

  return true;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isEqual(first: any, second: any, ignoreOrder = false): boolean {
  if (first === second) {
    return true;
  }
  if ((first === undefined || second === undefined || first === null || second === null) && (first || second)) {
    return false;
  }
  const firstType = first?.constructor.name;
  const secondType = second?.constructor.name;
  if (firstType !== secondType) {
    return false;
  }
  if (firstType === 'Array' && secondType === 'Array') {
    if (first.length !== second.length) {
      return false;
    }
    if (ignoreOrder) {
      const secondCopy = [...second];
      return first.every((item: any) => {
        const index = secondCopy.findIndex((secondItem: any) => isEqual(item, secondItem, ignoreOrder));
        if (index === -1) return false;
        secondCopy.splice(index, 1);
        return true;
      });
    } else {
      let equal = true;
      for (let i = 0; i < first.length; i++) {
        if (!isEqual(first[i], second[i], ignoreOrder)) {
          equal = false;
          break;
        }
      }
      return equal;
    }
  }
  if (firstType === 'Object' && secondType === 'Object') {
    let equal = true;
    const fKeys = Object.keys(first);
    const sKeys = Object.keys(second);
    if (fKeys.length !== sKeys.length) {
      return false;
    }
    for (let i = 0; i < fKeys.length; i++) {
      if (first[fKeys[i]] && second[fKeys[i]]) {
        if (first[fKeys[i]] === second[fKeys[i]]) {
          continue;
        }
        if (first[fKeys[i]] && (first[fKeys[i]].constructor.name === 'Array' || first[fKeys[i]].constructor.name === 'Object')) {
          equal = isEqual(first[fKeys[i]], second[fKeys[i]], ignoreOrder);
          if (!equal) {
            break;
          }
        } else if (first[fKeys[i]] !== second[fKeys[i]]) {
          equal = false;
          break;
        }
      } else if ((first[fKeys[i]] && !second[fKeys[i]]) || (!first[fKeys[i]] && second[fKeys[i]])) {
        equal = false;
        break;
      }
    }
    return equal;
  }
  return first === second;
}

export function orderBy(array: any[], keys: string[], orders: ('asc' | 'desc')[]) {
  return structuredClone(array).sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const order = orders[i];

      if (a[key] < b[key]) return order === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return order === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

export function structuredClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function isWebRtcCompatibleAudioCodec(audioCodec: AudioCodec): boolean {
  return audioCodec === 'opus' || audioCodec === 'G722' || audioCodec === 'PCMU' || audioCodec === 'PCMA';
}

export function isWebRtcCompatibleVideoCodec(videoCodec: string): boolean {
  return videoCodec === 'H264' || videoCodec === 'VP8' || videoCodec === 'VP9';
}

export function getCleanSdp(sdp: string, includeVideo: boolean, direction?: 'sendonly' | 'recvonly', webrtc?: boolean): string {
  return sdp
    .split('\nm=')
    .slice(1)
    .map((section) => 'm=' + section)
    .filter((section) => {
      const isVideoSection = section.startsWith('m=video');
      const isAudioSection = section.startsWith('m=audio');

      if (!includeVideo && isVideoSection) {
        return false;
      }

      if (direction) {
        const directionRegex = new RegExp(`a=${direction}`, 'i');
        if (!directionRegex.test(section)) {
          return false;
        }
      }

      if (webrtc) {
        const rtpmapLines = section.match(/a=rtpmap:\d+ ([^/]+)/g);
        if (rtpmapLines) {
          const hasCompatibleCodec = rtpmapLines.some((line) => {
            const match = /a=rtpmap:\d+ ([^/]+)/.exec(line);
            if (match) {
              const codec = match[1];
              if (isAudioSection) {
                return isWebRtcCompatibleAudioCodec(codec as AudioCodec);
              }
              if (isVideoSection) {
                return isWebRtcCompatibleVideoCodec(codec);
              }
            }
            return false;
          });

          if (!hasCompatibleCodec) {
            return false;
          }
        }
      }

      return true;
    })
    .join('\n');
}

// https://github.com/chalk/ansi-regex/blob/main/index.js
export default function ansiRegex({ onlyFirst = false } = {}) {
  const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';
  const pattern = [
    `[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?${ST})`,
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|');

  return new RegExp(pattern, onlyFirst ? undefined : 'g');
}
