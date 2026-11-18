/**
 * Pins how the `gzip-file-as-resource` guard classifies a resolved address,
 * one address at a time, so that every range is covered without a resolver or
 * a request. An IPv6 address that carries an IPv4 destination (IPv4-mapped,
 * IPv4-translated, or the well-known NAT64 prefix 64:ff9b::/96) is judged by
 * the IPv4 it wraps; deprecated IPv4-compatible (::/96) and site-local
 * (fec0::/10) addresses are refused, and so is any IPv6 address outside
 * global unicast (2000::/3). This mirrors the fetch server's
 * `_is_public_address`. The suite in gzip-private-addresses.test.ts drives the
 * same cases through the tool.
 */
import { describe, expect, it } from "vitest";
import { isNonPublic } from "../tools/gzip-file-as-resource.js";

describe("gzip-file-as-resource address classification", () => {
  it.each([
    // The well-known NAT64 prefix, judged by the IPv4 it wraps
    ["64:ff9b::a9fe:a9fe", "NAT64 of 169.254.169.254 (cloud metadata)"],
    ["64:ff9b::7f00:1", "NAT64 of 127.0.0.1"],
    ["64:ff9b::a00:1", "NAT64 of 10.0.0.1"],
    ["64:ff9b::169.254.169.254", "NAT64 of the metadata address, dotted"],
    ["64:ff9b:0:0:0:0:c0a8:1", "NAT64 of 192.168.0.1, uncompressed"],
    ["64:ff9b::", "NAT64 of 0.0.0.0"],
    ["64:ff9b:1::1", "local-use NAT64"],
    // IPv4-mapped and IPv4-translated, judged by the IPv4 they wrap
    ["::ffff:127.0.0.1", "IPv4-mapped loopback, dotted"],
    ["::ffff:a9fe:a9fe", "IPv4-mapped metadata address"],
    ["::ffff:0:7f00:1", "IPv4-translated loopback"],
    // Deprecated IPv4-compatible, refused whatever it holds
    ["::7f00:1", "IPv4-compatible loopback"],
    ["::5db8:d70e", "IPv4-compatible public address"],
    ["::", "unspecified"],
    ["::1", "loopback"],
    // Deprecated site-local
    ["fec0::1", "site-local"],
    ["feff::1", "site-local, top of the range"],
    // Outside 2000::/3, though in no listed range
    ["4000::1", "reserved by the IETF"],
    ["1::1", "reserved by the IETF, low"],
    ["3fff::1", "documentation (RFC 9637)"],
    ["fd00:ec2::254", "unique local"],
    ["fe80::1", "link-local"],
    ["ff02::1", "multicast"],
  ])("refuses %s (%s)", (address) => {
    expect(isNonPublic(address, 6)).toBe(true);
  });

  it.each([
    ["64:ff9b::5db8:d70e", "NAT64 of the public 93.184.215.14"],
    ["64:ff9b::93.184.215.14", "the same, dotted"],
    ["64:ff9b::c000:9", "NAT64 of the 192.0.0.9 exception"],
    ["::ffff:93.184.215.14", "IPv4-mapped public address"],
    ["::ffff:0:5db8:d70e", "IPv4-translated public address"],
    ["2606:4700::1", "global unicast"],
    ["2001:3::1", "the 2001:3::/32 exception"],
  ])("allows %s (%s)", (address) => {
    expect(isNonPublic(address, 6)).toBe(false);
  });

  it.each([
    ["169.254.169.254", true],
    ["10.0.0.1", true],
    ["192.0.0.9", false],
    ["93.184.215.14", false],
  ])("judges the IPv4 address %s as non-public: %s", (address, refused) => {
    expect(isNonPublic(address, 4)).toBe(refused);
  });
});
