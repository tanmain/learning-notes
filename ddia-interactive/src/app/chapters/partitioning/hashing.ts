/**
 * Tiny deterministic hashing helpers shared by the partitioning demos.
 * Not cryptographic — just a good-enough avalanche so visually-similar inputs
 * land far apart on the ring. DDIA notes MongoDB uses MD5 and Cassandra uses
 * Murmur3; we only need uniform spread, so a 32-bit FNV-1a + mix is plenty.
 */

export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // final avalanche (xorshift-style mix) so adjacent inputs scatter
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0; // force unsigned 32-bit
}

/** Map any string to a stable angle in degrees on [0, 360). */
export function hashAngle(input: string): number {
  return (hash32(input) / 0xffffffff) * 360;
}

export type RingToken = { angle: number; nodeId: string; vnode: number };

/**
 * Build the sorted token ring for a set of physical nodes. A node may own
 * several positions (virtual nodes / vnodes), which spreads each physical
 * node's responsibility into many small arcs — keeping load even and shrinking
 * the slice of keys that move when a node joins or leaves.
 */
export function buildRing(nodeIds: string[], vnodes: number): RingToken[] {
  const tokens: RingToken[] = [];
  for (const nodeId of nodeIds) {
    for (let v = 0; v < vnodes; v++) {
      tokens.push({ angle: hashAngle(`${nodeId}#${v}`), nodeId, vnode: v });
    }
  }
  tokens.sort((a, b) => a.angle - b.angle);
  return tokens;
}

/**
 * Consistent hashing lookup: a key is owned by the FIRST token clockwise from
 * the key's angle (wrapping past 360 back to the first token). Returns the
 * owning physical node id.
 */
export function ownerOf(keyAngle: number, ring: RingToken[]): string {
  if (ring.length === 0) return "";
  for (const t of ring) {
    if (t.angle >= keyAngle) return t.nodeId;
  }
  // wrapped around the top of the ring
  return ring[0].nodeId;
}
