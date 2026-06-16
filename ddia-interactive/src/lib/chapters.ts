/**
 * Chapter manifest — the single source of truth for the site.
 * Navigation, the landing page, routing, and every chapter page derive their
 * metadata from here. Chapter pages live at /chapters/<slug> and are built
 * independently; they read this manifest but never edit it.
 */

export type Part = {
  id: "i" | "ii" | "iii";
  label: string;
  title: string;
};

export const PARTS: Record<Part["id"], Part> = {
  i: { id: "i", label: "Part I", title: "Foundations of Data Systems" },
  ii: { id: "ii", label: "Part II", title: "Distributed Data" },
  iii: { id: "iii", label: "Part III", title: "Derived Data" },
};

export type Chapter = {
  number: number;
  slug: string;
  title: string;
  /** Short evocative tagline. */
  subtitle: string;
  /** One-sentence hook for cards. */
  blurb: string;
  part: Part["id"];
  /** Sub-section names, in order. */
  sections: string[];
  /** Key terms — used for nav search and ambient labels. */
  concepts: string[];
  /** Primary accent hue (hex). */
  accent: string;
  /** Complementary accent for two-tone gradients/flows. */
  accent2: string;
  /** [start, end] line range in books/designing-data-intensive-applications.md */
  sourceLines: [number, number];
};

export const CHAPTERS: Chapter[] = [
  {
    number: 1,
    slug: "foundations",
    title: "Reliable, Scalable & Maintainable Applications",
    subtitle: "The three pillars every data system is judged by",
    blurb:
      "What do we actually mean by reliability, scalability, and maintainability — and how do you measure them with percentiles, load parameters, and operability?",
    part: "i",
    sections: ["Reliability", "Scalability", "Maintainability"],
    concepts: ["faults vs failures", "p99 latency", "load parameters", "operability", "throughput"],
    accent: "#f5b13d",
    accent2: "#2ba6ec",
    sourceLines: [57, 199],
  },
  {
    number: 2,
    slug: "data-models",
    title: "Data Models & Query Languages",
    subtitle: "Relational, document, and graph — and the languages that read them",
    blurb:
      "Why the right data model depends on your access patterns: the object–relational mismatch, schema-on-read, and declarative vs imperative queries.",
    part: "i",
    sections: ["Relational vs Document", "Query Languages", "Graph-Like Models"],
    concepts: ["impedance mismatch", "schema-on-read", "normalization", "declarative queries", "triple-stores"],
    accent: "#f5903d",
    accent2: "#16b8c2",
    sourceLines: [200, 382],
  },
  {
    number: 3,
    slug: "storage-retrieval",
    title: "Storage & Retrieval",
    subtitle: "How databases lay bytes on disk — and find them again",
    blurb:
      "The engines underneath: log-structured merge-trees vs B-trees, why OLTP and OLAP diverged, and how column storage makes analytics fly.",
    part: "i",
    sections: ["Storage Engines (LSM vs B-Tree)", "OLTP vs OLAP", "Column-Oriented Storage"],
    concepts: ["LSM-tree", "SSTable", "B-tree", "write amplification", "column compression"],
    accent: "#f56b5e",
    accent2: "#1cba8b",
    sourceLines: [383, 566],
  },
  {
    number: 4,
    slug: "encoding",
    title: "Encoding & Evolution",
    subtitle: "Serialization, schemas, and surviving change",
    blurb:
      "How data crosses the wire and the years: JSON vs Thrift vs Protocol Buffers vs Avro, and forward/backward compatibility as systems evolve.",
    part: "i",
    sections: ["Encoding Formats", "Modes of Dataflow"],
    concepts: ["forward compatibility", "backward compatibility", "Avro", "Protocol Buffers", "schema evolution"],
    accent: "#ee5a8b",
    accent2: "#7d74f2",
    sourceLines: [567, 727],
  },
  {
    number: 5,
    slug: "replication",
    title: "Replication",
    subtitle: "Keeping copies of data in sync across machines",
    blurb:
      "Single-leader, multi-leader, and leaderless replication — replication lag, read-your-writes, quorums, and the consistency you trade for availability.",
    part: "ii",
    sections: ["Leaders & Followers", "Replication Lag", "Multi-Leader", "Leaderless"],
    concepts: ["replication lag", "read-your-writes", "quorum (w+r>n)", "conflict resolution", "failover"],
    accent: "#b066ea",
    accent2: "#f5b13d",
    sourceLines: [728, 1045],
  },
  {
    number: 6,
    slug: "partitioning",
    title: "Partitioning",
    subtitle: "Splitting one big dataset across many nodes",
    blurb:
      "Sharding by key range vs hash, the hot-spot problem, partitioning secondary indexes, rebalancing without downtime, and routing requests.",
    part: "ii",
    sections: [
      "Partitioning + Replication",
      "Key-Value Partitioning",
      "Secondary Indexes",
      "Rebalancing",
      "Request Routing",
    ],
    concepts: ["hash partitioning", "hot spots", "consistent hashing", "rebalancing", "request routing"],
    accent: "#7d74f2",
    accent2: "#f5903d",
    sourceLines: [1046, 1139],
  },
  {
    number: 7,
    slug: "transactions",
    title: "Transactions",
    subtitle: "Making many small operations behave like one",
    blurb:
      "ACID demystified: the race conditions weak isolation lets through (dirty reads, skew, lost updates) and how serializability shuts them down.",
    part: "ii",
    sections: ["The Concept of a Transaction", "Weak Isolation Levels", "Serializability"],
    concepts: ["ACID", "snapshot isolation", "write skew", "lost update", "two-phase locking"],
    accent: "#4f93f5",
    accent2: "#f56b5e",
    sourceLines: [1140, 1399],
  },
  {
    number: 8,
    slug: "distributed-trouble",
    title: "The Trouble with Distributed Systems",
    subtitle: "Everything that can go wrong, will",
    blurb:
      "Partial failures, unbounded network delays, untrustworthy clocks, and why a node can never really know the truth — the pessimist's tour.",
    part: "ii",
    sections: ["Faults & Partial Failures", "Unreliable Networks", "Unreliable Clocks", "Knowledge, Truth & Lies"],
    concepts: ["partial failure", "network partition", "clock skew", "fencing tokens", "Byzantine faults"],
    accent: "#2ba6ec",
    accent2: "#ee5a8b",
    sourceLines: [1400, 1551],
  },
  {
    number: 9,
    slug: "consistency-consensus",
    title: "Consistency & Consensus",
    subtitle: "Agreeing on a single truth, despite the chaos",
    blurb:
      "Linearizability, causal ordering, total order broadcast, and consensus — the algorithms that let unreliable nodes agree on what happened.",
    part: "ii",
    sections: ["Consistency Guarantees", "Linearizability", "Ordering Guarantees", "Distributed Transactions & Consensus"],
    concepts: ["linearizability", "causal order", "total order broadcast", "consensus", "two-phase commit"],
    accent: "#16b8c2",
    accent2: "#b066ea",
    sourceLines: [1552, 1799],
  },
  {
    number: 10,
    slug: "batch-processing",
    title: "Batch Processing",
    subtitle: "Crunching bounded datasets, the Unix way and beyond",
    blurb:
      "From Unix pipes to MapReduce to dataflow engines: the philosophy of immutable inputs, deterministic functions, and reliable large-scale joins.",
    part: "iii",
    sections: ["Unix Tools", "MapReduce & Distributed Filesystems", "Beyond MapReduce"],
    concepts: ["MapReduce", "sort-merge join", "immutable inputs", "dataflow engines", "HDFS"],
    accent: "#1cba8b",
    accent2: "#f5b13d",
    sourceLines: [1800, 1992],
  },
  {
    number: 11,
    slug: "stream-processing",
    title: "Stream Processing",
    subtitle: "Unbounded data, processed as it arrives",
    blurb:
      "Event streams, message brokers, change data capture, event sourcing, and the windows and joins that tame never-ending data.",
    part: "iii",
    sections: ["Transmitting Event Streams", "Databases & Streams", "Processing Streams"],
    concepts: ["event log", "change data capture", "event sourcing", "windowing", "exactly-once"],
    accent: "#54b94a",
    accent2: "#4f93f5",
    sourceLines: [1993, 2295],
  },
  {
    number: 12,
    slug: "future",
    title: "The Future of Data Systems",
    subtitle: "Composing correct systems from imperfect parts",
    blurb:
      "Dataflow as the unifying idea: unbundling the database, end-to-end correctness, derived state, and doing the right thing with data.",
    part: "iii",
    sections: ["Data Integration", "Unbundling Databases", "Aiming for Correctness", "Doing the Right Thing"],
    concepts: ["dataflow", "unbundling", "end-to-end argument", "derived data", "data ethics"],
    accent: "#9ac23c",
    accent2: "#2ba6ec",
    sourceLines: [2296, 2568],
  },
];

export function getChapter(slug: string): Chapter | undefined {
  return CHAPTERS.find((c) => c.slug === slug);
}

export function getAdjacentChapters(slug: string): {
  prev: Chapter | null;
  next: Chapter | null;
} {
  const i = CHAPTERS.findIndex((c) => c.slug === slug);
  return {
    prev: i > 0 ? CHAPTERS[i - 1] : null,
    next: i >= 0 && i < CHAPTERS.length - 1 ? CHAPTERS[i + 1] : null,
  };
}

export const TOTAL_CHAPTERS = CHAPTERS.length;
