import net from 'node:net';
import { networkInterfaces } from 'os';
import { networkInterfaces as ni } from 'systeminformation';

import type { NetworkInterfaceInfo } from 'os';
import type { Systeminformation } from 'systeminformation';

export type IPVersion = 'ipv4' | 'ipv6';

export interface UsableNetworkAddress {
  address: string;
  isPrivate: boolean;
}

class IPRange {
  private ranges = new Map<IPVersion, [bigint, bigint][]>();

  constructor(entries: [string, number, IPVersion?][]) {
    entries.forEach(([ip, prefixLength, version = 'ipv4']) => this.addSubnet(ip, prefixLength, version));
  }

  private ipToBigInt(ip: string): bigint {
    if (ip.includes(':')) {
      return BigInt(
        `0x${ip
          .split(':')
          .map((part) => part.padStart(4, '0'))
          .join('')}`,
      );
    }
    return BigInt(
      `0x${ip
        .split('.')
        .map((octet) => parseInt(octet).toString(16).padStart(2, '0'))
        .join('')}`,
    );
  }

  private addSubnet(ip: string, prefixLength: number, version: IPVersion): void {
    const subnet = this.ipToBigInt(ip);
    const bits = version === 'ipv4' ? 32n : 128n;
    const mask = (1n << (bits - BigInt(prefixLength))) - 1n;
    const start = subnet & ~mask;
    const end = start | mask;
    if (!this.ranges.has(version)) {
      this.ranges.set(version, []);
    }
    this.ranges.get(version)!.push([start, end]);
  }

  check(ip: string, version: IPVersion): boolean {
    const ranges = this.ranges.get(version);
    if (!ranges) return false;
    const ipInt = this.ipToBigInt(ip);
    return ranges.some(([start, end]) => ipInt >= start && ipInt <= end);
  }
}

const unusableRanges = new IPRange([
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10], // CG-NAT (also Tailscale's overlay range) — never routable from outside that overlay
  ['0.0.0.0', 8],
  ['240.0.0.0', 4],
  ['::1', 128, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
]);

const privateRanges = new IPRange([
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['fc00::', 7, 'ipv6'],
]);

export const isIPv4EmbeddedIPv6 = (ip: string): boolean => ip.includes(':') && ip.startsWith('::ffff:');

export const extractPureIPAddress = (address: string): string => (isIPv4EmbeddedIPv6(address) ? address.slice(7) : address);

export function buildHttpsUrl(address: string, port: number): string {
  const clean = extractPureIPAddress(address);
  const hostPart = clean.includes(':') ? `[${clean}]` : clean;
  return `https://${hostPart}:${port}`;
}

export const isValidNetworkAddress = (ip: string): boolean => {
  if (!ip) return false;
  try {
    const cleanedIp = extractPureIPAddress(ip);
    const version: IPVersion = cleanedIp.includes(':') ? 'ipv6' : 'ipv4';
    return !unusableRanges.check(cleanedIp, version);
  } catch {
    return false;
  }
};

export const isInternalNetworkAddress = (ip: string): boolean => {
  const cleanedIp = extractPureIPAddress(ip);
  const version: IPVersion = cleanedIp.includes(':') ? 'ipv6' : 'ipv4';
  return privateRanges.check(cleanedIp, version);
};

export function isLoopbackAddress(ip: string): boolean {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('::ffff:127.')) return true;
  return false;
}

export function isLoopbackHost(host: string): boolean {
  if (!host) return false;
  let hostname = host;
  if (hostname.startsWith('[')) {
    const close = hostname.indexOf(']');
    if (close === -1) return false;
    hostname = hostname.slice(1, close);
  } else {
    const colon = hostname.lastIndexOf(':');
    if (colon !== -1 && !hostname.includes('::')) hostname = hostname.slice(0, colon);
  }
  if (hostname === 'localhost') return true;
  return isLoopbackAddress(hostname);
}

export function isLanClientAddress(remoteIp: string | undefined, localIp: string | undefined): boolean {
  if (!remoteIp || !localIp) return false;
  if (isLoopbackAddress(localIp)) return false;

  const remote = extractPureIPAddress(remoteIp);
  const local = extractPureIPAddress(localIp);

  if (net.isIPv4(remote)) {
    if (remote === '127.0.0.1') return true;
    if (remote.startsWith('10.') || remote.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(remote)) return true;
    return false;
  }

  if (net.isIPv6(remote)) {
    const r = remote.toLowerCase();
    if (r === '::1') return true;
    if (r.startsWith('fc') || r.startsWith('fd')) return true;
    if (r.startsWith('fe80:')) return true;

    if (net.isIPv6(local)) {
      try {
        const block = new net.BlockList();
        block.addSubnet(local, 64, 'ipv6');
        return block.check(remote, 'ipv6');
      } catch {
        return false;
      }
    }
  }

  return false;
}

export const fetchViableNetworkAddresses = (): UsableNetworkAddress[] => {
  const interfaces = Object.values(networkInterfaces())
    .flat()
    .filter((ni): ni is NetworkInterfaceInfo => ni !== undefined);

  const isValidInterface = (ni: NetworkInterfaceInfo) => isValidNetworkAddress(ni.address) && !ni.internal;

  return interfaces.filter(isValidInterface).map((ni) => ({
    address: ni.address,
    isPrivate: isInternalNetworkAddress(ni.address),
  }));
};

export const getSystemNetworkInterfaces = async (): Promise<Systeminformation.NetworkInterfacesData[]> => {
  let allInterfaces = await ni();

  if (!Array.isArray(allInterfaces)) {
    allInterfaces = [allInterfaces];
  }

  const interfaces = allInterfaces.filter((adapter) => {
    return !adapter.internal && (adapter.ip4 || adapter.ip6);
  });

  return interfaces;
};
