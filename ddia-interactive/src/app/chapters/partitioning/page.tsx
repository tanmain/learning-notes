import type { Metadata } from "next";
import {
  ChapterShell,
  Section,
  Prose,
  Analogy,
  RealWorld,
  Callout,
  KeyTakeaways,
  DemoFrame,
  Figure,
  DefinitionGrid,
  CompareTable,
  CodeBlock,
  YouTubeEmbed,
  FurtherReading,
  Quiz,
  AskClaude,
} from "@/components/chapter";
import { Hero } from "./Hero";
import { RingDemo } from "./RingDemo";
import { HotspotDemo } from "./HotspotDemo";
import { IndexDemo } from "./IndexDemo";

export const metadata: Metadata = {
  title: "Partitioning",
  description:
    "Splitting one big dataset across many nodes: range vs hash partitioning, hot spots, partitioning secondary indexes, rebalancing without downtime, and request routing.",
};

const CONCEPTS = `Partitioning (sharding) breaks a large dataset into partitions so a single
node no longer holds everything. Each record belongs to exactly one partition; a partition is itself a small
database. The primary motivation is scalability: spreading data and query load across many nodes scales both
storage and throughput. Partitioning is almost always combined with replication — each partition is replicated
to several nodes for fault tolerance, and one node typically holds many partitions (often as leader for some and
follower for others).

Key-value partitioning aims to spread data and load evenly. Uneven distribution is skew; a partition with
disproportionate load is a hot spot. Two main strategies: (1) Partition by key range — assign contiguous ranges,
keys kept sorted so range scans are efficient, but sequential/monotonic keys (e.g. timestamps) cause write hot
spots. (2) Partition by hash of key — a hash function turns skewed input into a uniform distribution (MongoDB uses
MD5, Cassandra uses Murmur3); it spreads load well but destroys efficient range queries because adjacent keys
scatter across partitions. Even hashing cannot fix a single hot key; the application must relieve it, e.g. by
adding a random prefix/suffix (salting) to split writes across keys, at the cost of extra read work to recombine.

Secondary indexes don't map neatly to partitions. Document-partitioned (local) indexes: each partition indexes
only its own documents, so reads must scatter/gather across all partitions and merge — prone to tail-latency
amplification (used by MongoDB, Riak, Cassandra, Elasticsearch, SolrCloud, VoltDB). Term-partitioned (global)
indexes: the index is partitioned by the term being searched, so a read hits a single partition (fast), but a
single write may update several index partitions, making writes slower and consistency harder.

Rebalancing moves load between nodes. Hash mod N is bad: changing N remaps almost all keys. Better strategies:
a fixed (large) number of partitions spread over nodes (steal a few per node when adding one — Riak, Elasticsearch,
Couchbase, Voldemort); dynamic partitioning that splits/merges with data volume (HBase, MongoDB, with pre-splitting);
and a fixed number of partitions per node, proportional to node count (Cassandra, Ketama). Consistent hashing moves
only a fraction of keys when topology changes. Automatic rebalancing is convenient but risky; a human in the loop
avoids operational surprises.

Request routing (service discovery) answers "which node holds the key I want?": clients contact any node which
forwards; a partition-aware routing tier/load balancer; or partition-aware clients. The hard part is learning about
assignment changes — many systems use ZooKeeper (HBase, SolrCloud, Kafka), MongoDB uses a config server, and
Cassandra/Riak use a gossip protocol. Massively parallel processing (MPP) databases parallelize complex analytic
queries across partitions.`;

export default function Page() {
  return (
    <ChapterShell slug="partitioning" diagram={<Hero />}>
      {/* ------------------------------------------------ Intro / Replication */}
      <Section
        id="partitioning-and-replication"
        kicker="Partitioning + Replication"
        title="One dataset, many nodes"
        intro="Replication keeps copies; partitioning splits the original. Big systems need both."
      >
        <Prose>
          <p>
            Replication, which we met in the last chapter, keeps multiple <em>copies</em> of the same data on
            different nodes. That buys fault tolerance and read scaling, but it does nothing for a dataset that is
            simply <em>too large</em> for one machine, or a write throughput that exceeds what a single node can
            absorb. For that we need <strong>partitioning</strong> — also called <strong>sharding</strong> — which
            splits one big dataset into smaller <strong>partitions</strong>, each of which lives on a different node.
          </p>
          <p>
            The defining rule is simple: <strong>each record belongs to exactly one partition.</strong> A partition is,
            in effect, a small database of its own. The point of doing this is <strong>scalability</strong>: with the
            data split across many nodes, both storage capacity and query load can be spread out, and you scale
            throughput by adding more machines.
          </p>
          <p>
            Partitioning is almost never used alone. It is normally combined with <strong>replication</strong>: each
            partition is itself stored on several nodes so that losing a machine doesn&rsquo;t lose data. The two
            concepts are orthogonal. A single node typically holds <em>many</em> partitions — and in a leader-based
            setup it may be the leader for some partitions while simultaneously acting as a follower for others. The
            mental model to hold: partitioning decides <em>where a record lives</em>; replication decides{" "}
            <em>how many copies of that location exist</em>.
          </p>
        </Prose>

        <Figure caption="Partitioning and replication are independent dimensions. Here 4 partitions are spread over 3 nodes, each replicated to a second node (the follower copies are dimmed).">
          <PartReplFigure />
        </Figure>

        <Analogy title="Analogy — a chain of warehouses">
          Replication is photocopying the same ledger and keeping a copy in two buildings, so if one burns down you
          still have the records. Partitioning is splitting the inventory itself: warehouse A stocks SKUs starting
          A&ndash;H, warehouse B stocks I&ndash;P, warehouse C stocks Q&ndash;Z. No one building can hold everything,
          so you divide the goods — and you still photocopy each warehouse&rsquo;s ledger to a backup site. Real
          operations do both at once.
        </Analogy>

        <Callout variant="insight">
          Replication answers &ldquo;what if a node dies?&rdquo; Partitioning answers &ldquo;what if the data
          doesn&rsquo;t fit, or the writes won&rsquo;t keep up?&rdquo; You almost always need both, and they compose
          cleanly because they solve different problems.
        </Callout>

        <RealWorld
          examples={[
            {
              system: "Cassandra",
              detail: (
                <>
                  partitions data by a hash of the partition key and replicates each partition to N nodes around a
                  token ring — partitioning and replication baked into the same ring model.
                </>
              ),
            },
            {
              system: "MongoDB",
              detail: (
                <>
                  shards a collection across replica sets; each shard is itself a replica set (one primary, several
                  secondaries), cleanly separating the two concerns.
                </>
              ),
            },
            {
              system: "Kafka",
              detail: (
                <>
                  a topic is split into partitions; each partition has a leader replica and follower replicas — the
                  unit of parallelism <em>and</em> the unit of fault tolerance.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* --------------------------------------------------- Key-value layout */}
      <Section
        id="key-value-partitioning"
        kicker="Key-Value Partitioning"
        title="Range vs hash — and the hot-spot trap"
        intro="How you map a key to a partition decides whether range scans are cheap and whether your load is even."
      >
        <Prose>
          <p>
            The goal of partitioning is to spread data and query load <strong>evenly</strong> across nodes. When the
            split is uneven we call it <strong>skewed</strong>, and a partition that ends up with a disproportionate
            share of the load is a <strong>hot spot</strong>. A hot spot defeats the whole point: you added ten
            machines but one of them is doing all the work.
          </p>
          <p>
            You could assign records to partitions <em>randomly</em>, which spreads load perfectly — but then you have
            no idea which node holds a given key, so every read must query all nodes in parallel. Useless. So we need
            an assignment that is both even <em>and</em> looked-up cheaply. Two strategies dominate:
          </p>
          <ul>
            <li>
              <strong>Partition by key range.</strong> Assign each partition a contiguous range of keys, like the
              volumes of an encyclopaedia (A&ndash;C, D&ndash;F, &hellip;). Boundaries can be chosen by an
              administrator or by the database automatically. Within each partition keys are kept in{" "}
              <strong>sorted order</strong>, which makes range scans (&ldquo;all orders from March&rdquo;) efficient.
              The danger: certain access patterns create hot spots — a timestamp key means today&rsquo;s writes all
              hammer the last partition.
            </li>
            <li>
              <strong>Partition by hash of key.</strong> Run the key through a hash function and assign partitions
              ranges of <em>hash</em> values. A good hash turns skewed input into a uniform spread; it need not be
              cryptographic (MongoDB uses MD5, Cassandra uses Murmur3). This kills hot spots from sequential keys — but
              it also <strong>destroys range queries</strong>, because keys that were adjacent are now scattered
              across every partition, so a range scan must touch them all.
            </li>
          </ul>
          <p>
            And here is the trap that <em>no</em> hashing scheme escapes: a single <strong>hot key</strong>. If one
            celebrity user, one viral post, or one product on sale receives a huge share of writes, hashing routes
            every write for that <em>exact</em> key to the same partition. The database can&rsquo;t fix this — it&rsquo;s
            the application&rsquo;s job. The standard trick is to <strong>salt</strong> the key: add a random prefix or
            suffix so writes split across, say, ten sub-keys. The cost is that reads must now query all ten and
            recombine the results.
          </p>
        </Prose>

        <DemoFrame
          label="Try it yourself"
          title="Write-distribution simulator"
          description="Fire 2,000 writes through 8 partitions. Switch between range and hash partitioning, choose a workload, and watch where the load lands. The 'one hot key' workload lets you salt the key and see the trade-off."
          right="2,000 ops"
        >
          <HotspotDemo />
        </DemoFrame>

        <Callout variant="tradeoff">
          Range partitioning gives you efficient scans but invites hot spots on sequential keys. Hash partitioning
          gives you even load but no efficient range scans. Some systems offer a compromise — a{" "}
          <strong>compound key</strong> where the first part is hashed (to pick the partition) and the rest is kept
          sorted (so scans <em>within</em> a partition still work). Cassandra&rsquo;s partition-key / clustering-key
          split is exactly this.
        </Callout>

        <CompareTable
          caption="Choosing how to map keys to partitions."
          columns={["Key range", "Hash of key"]}
          rows={[
            {
              feature: "Range scans",
              values: ["Efficient — keys stay sorted", "Inefficient — must hit all partitions"],
            },
            {
              feature: "Load on sequential keys",
              values: ["Hot spot on the last range", "Spread evenly"],
            },
            {
              feature: "Single hot key",
              values: ["Overloads one partition", "Still overloads one partition"],
            },
            {
              feature: "Used by",
              values: [
                "HBase, Bigtable, RethinkDB (sorted)",
                "Cassandra, MongoDB (hashed shard key), Voldemort",
              ],
            },
          ]}
        />

        <Analogy title="Analogy — filing cabinets">
          Range partitioning is an alphabetical filing cabinet: pulling &ldquo;everyone with surname M&ndash;N&rdquo; is
          one drawer, but if a new policy means every new file is named with today&rsquo;s date, all of them jam into
          the last drawer. Hash partitioning is throwing each file into one of eight bins based on a number stamped on
          it: the bins fill evenly, but &ldquo;give me all the M&ndash;N files&rdquo; now means searching all eight
          bins.
        </Analogy>

        <RealWorld
          examples={[
            {
              system: "HBase / Bigtable",
              detail: <>range-partition by row key and keep rows sorted, so scans over a key prefix are cheap.</>,
            },
            {
              system: "Cassandra",
              detail: (
                <>
                  hashes the partition key (Murmur3, default since 1.2) for even spread, but keeps clustering columns
                  sorted <em>inside</em> each partition for ordered access — the compound-key compromise above.
                </>
              ),
            },
            {
              system: "Discord (messages)",
              detail: (
                <>
                  partitions messages by a compound <code>(channel_id, bucket)</code> key — a fixed time window — so a
                  single busy channel can&rsquo;t monopolize one partition forever. A red-hot channel was still a
                  textbook <strong>hot partition</strong> that overloaded one node; their fix was an application-side
                  data-services layer (request coalescing) plus a move to a shard-per-core engine.
                </>
              ),
            },
          ]}
        />

        <CodeBlock
          lang="text"
          caption="Salting a hot key: split writes across N buckets, then scatter-read and merge."
          code={`# WRITE — pick a random bucket so writes fan out
bucket = random(0, N-1)
key    = f"celeb#{bucket}:like_count"
incr(key)

# READ — must gather all N buckets and sum them
total = sum(get(f"celeb#{b}:like_count") for b in range(N))

# Trade-off: writes get N-way relief; every read does N lookups.
# Only salt the few keys you KNOW are hot — tracking which is itself work.`}
        />
      </Section>

      {/* ------------------------------------------------- Secondary indexes */}
      <Section
        id="secondary-indexes"
        kicker="Secondary Indexes"
        title="Partitioning secondary indexes"
        intro="A secondary index doesn't identify a record uniquely, so it doesn't line up with the partitions — you must choose how to split the index itself."
      >
        <Prose>
          <p>
            So far a record had one key and lived in one partition. But applications also search by{" "}
            <strong>other</strong> attributes — &ldquo;all red cars&rdquo;, &ldquo;all articles tagged{" "}
            <code>databases</code>&rdquo;. That&rsquo;s a <strong>secondary index</strong>, and unlike the primary key
            it doesn&rsquo;t identify a record uniquely, so it doesn&rsquo;t map neatly onto partitions. There are two
            ways to partition the index, and they sit at opposite ends of a read/write trade-off.
          </p>
          <ul>
            <li>
              <strong>Partition by document (local index).</strong> Each partition keeps a secondary index covering{" "}
              <em>only the documents stored in that partition</em>. Writes are simple — adding a document touches only
              its own partition&rsquo;s index. But a query like &ldquo;color = red&rdquo; can&rsquo;t know which
              partitions hold matches, so it must be sent to <strong>all</strong> of them and the results merged. This
              is <strong>scatter/gather</strong>, and it is prone to <strong>tail-latency amplification</strong>: the
              query is only as fast as the slowest partition it touched.
            </li>
            <li>
              <strong>Partition by term (global index).</strong> Build a single global index, but partition the{" "}
              <em>index itself</em> by the <strong>term</strong> being searched — so all entries for{" "}
              <code>red</code> live on one index shard. It&rsquo;s called <em>term-partitioned</em> because the term
              you&rsquo;re looking for determines the partition. A read now hits a <strong>single</strong> partition —
              no scatter. The price: writing one document may update several index shards (one per indexed term), so
              writes are slower and keeping the index consistent is harder (often done asynchronously).
            </li>
          </ul>
          <p>
            A nice extra: partitioning the term index <em>by term value</em> (range) supports range scans on the
            index, whereas partitioning it by a <em>hash of the term</em> gives more even load. Same range-vs-hash
            choice, one level up.
          </p>
        </Prose>

        <DemoFrame
          label="Try it yourself"
          title="Scatter/gather vs term-partitioned read"
          description="Run the query 'color = X' against the same 12 documents under each index strategy. Watch how many partitions the read has to contact, and why."
          right="12 docs · 3 partitions"
        >
          <IndexDemo />
        </DemoFrame>

        <DefinitionGrid
          items={[
            {
              term: "Local / document-partitioned index",
              def: (
                <>
                  index lives with the data it describes; cheap writes, but reads <em>scatter/gather</em> across all
                  partitions.
                </>
              ),
            },
            {
              term: "Global / term-partitioned index",
              def: (
                <>
                  index partitioned by search term; reads hit one partition, but a single write fans out to many
                  index partitions.
                </>
              ),
            },
            {
              term: "Scatter/gather",
              def: <>send a query to every partition and merge the responses — simple, but tail-latency prone.</>,
            },
            {
              term: "Tail-latency amplification",
              def: <>a request that fans out is only as fast as its slowest sub-request, so p99s compound.</>,
            },
          ]}
        />

        <Callout variant="warning">
          Scatter/gather makes a read&rsquo;s latency the <em>maximum</em> over all partitions, not the average. With
          enough partitions, even a small chance of one being slow means almost every query waits on a straggler.
          This is why document-partitioned indexes are common but their reads can feel unpredictable under load.
        </Callout>

        <RealWorld
          examples={[
            {
              system: "Elasticsearch / SolrCloud",
              detail: (
                <>
                  use document-partitioned (local) indexes: a search scatters to every shard and gathers the merged
                  top results.
                </>
              ),
            },
            {
              system: "MongoDB, Riak, Cassandra, VoltDB",
              detail: <>maintain local secondary indexes per partition — scatter/gather on secondary-attribute reads.</>,
            },
            {
              system: "DynamoDB Global Secondary Index",
              detail: (
                <>
                  is term-partitioned: the GSI is its own partitioned table keyed by the indexed attribute, updated
                  asynchronously from the base table.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ----------------------------------------------------- Rebalancing */}
      <Section
        id="rebalancing"
        kicker="Rebalancing"
        title="Rebalancing without reshuffling everything"
        intro="When you add or remove nodes, load must move — but moving more than necessary wastes a fortune in network and disk I/O."
      >
        <Prose>
          <p>
            Clusters change: data grows, machines fail, you add capacity. <strong>Rebalancing</strong> is the process
            of moving load from one node to another. The non-negotiable requirements: after rebalancing the load
            should be fairly shared, the database should keep serving reads and writes <em>during</em> the move, and
            no <em>more</em> data than necessary should move between nodes — because moving data is expensive and
            steals network and disk bandwidth from real queries.
          </p>
          <p>
            The infamous wrong answer is <strong><code>hash(key) mod N</code></strong>. It distributes evenly, but the
            moment <code>N</code> changes (a node joins or leaves), the modulus changes and{" "}
            <strong>almost every key</strong> is suddenly assigned to a different node. You&rsquo;d move nearly the
            whole dataset to add one machine. The fixes all share one idea: <strong>decouple the number of partitions
            from the number of nodes.</strong>
          </p>
          <ul>
            <li>
              <strong>Fixed number of partitions.</strong> Create many more partitions than nodes (say 1,000
              partitions over 10 nodes) and assign several to each node. To add a node, it <em>steals</em> a few whole
              partitions from each existing node. The partition&ndash;to&ndash;key mapping never changes; only the
              partition&ndash;to&ndash;node mapping does. You must pick the partition count up front to accommodate
              future growth. <em>(Riak, Elasticsearch, Couchbase, Voldemort.)</em>
            </li>
            <li>
              <strong>Dynamic partitioning.</strong> The number of partitions adapts to data volume: a partition that
              grows too big splits in two; one that shrinks merges with a neighbour — like a B-tree. An empty database
              starts with one partition (so all early writes hit one node until the first split, which{" "}
              <strong>pre-splitting</strong> avoids). <em>(HBase, MongoDB.)</em>
            </li>
            <li>
              <strong>Partitioning proportional to nodes.</strong> A fixed number of partitions <em>per node</em>, so
              the total grows with the cluster. Each new node grabs random slices of existing partitions to split.
              Keeps partition size roughly stable as you scale. <em>(Cassandra, Ketama.)</em>
            </li>
          </ul>
          <p>
            <strong>Consistent hashing</strong> is the classic technique behind &ldquo;move only a fraction of keys&rdquo;:
            place both nodes and keys on a ring, and a key belongs to the next node clockwise. Add a node and only the
            keys in its arc move; everyone else stays put. <strong>Virtual nodes</strong> (giving each physical node
            many small arcs) smooth out the load and shrink the slices that move.
          </p>
        </Prose>

        <DemoFrame
          label="Try it yourself"
          title="Consistent-hashing ring vs naive hash % N"
          description="Drive the cluster: add or remove nodes and keys, and watch which node owns each key — and how few keys are forced to move when the topology changes. Flip to 'Naive hash % N' to see almost everything reshuffle on a single node change. Raise the vnode count to smooth out the per-node load bars."
          right="add nodes + keys"
        >
          <RingDemo />
        </DemoFrame>

        <Callout variant="insight">
          With consistent hashing and <em>K</em> keys over <em>N</em> nodes, adding one node moves only about{" "}
          <code>K / (N+1)</code> keys — the keys in the new node&rsquo;s arc. With <code>mod N</code> you move on the
          order of <code>K</code> keys. That difference is the whole reason consistent hashing exists.
        </Callout>

        <Analogy title="Analogy — seating at a round table">
          Imagine guests (keys) seated around a circular table, each served by the next waiter (node) clockwise. Add a
          new waiter and they take over serving just the guests in their slice of the table — everyone else keeps the
          same waiter. Compare that to &ldquo;guest number mod number-of-waiters&rdquo;: hire one waiter and suddenly
          almost every guest is reassigned, and the whole room has to get up and move.
        </Analogy>

        <Prose>
          <p>
            One more decision: <strong>automatic vs manual</strong> rebalancing. Fully automatic rebalancing is
            convenient, but it can be dangerous — if the system mistakes an overloaded node for a dead one and starts
            shifting data, it can <em>add</em> load to an already-struggling cluster and cascade into a wider failure.
            A <strong>human in the loop</strong> (the system proposes a plan, an operator approves it) is slower but
            avoids nasty operational surprises.
          </p>
        </Prose>

        <RealWorld
          examples={[
            {
              system: "Elasticsearch",
              detail: <>uses a fixed number of shards chosen at index-creation time and relocates whole shards between nodes.</>,
            },
            {
              system: "HBase",
              detail: <>splits regions dynamically as they grow past a size threshold and reassigns them across region servers.</>,
            },
            {
              system: "Cassandra (vnodes)",
              detail: (
                <>
                  gives each node many virtual tokens on the ring, so adding a node pulls a little data from many peers
                  rather than a lot from one.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* --------------------------------------------------- Request routing */}
      <Section
        id="request-routing"
        kicker="Request Routing"
        title="Finding the node that holds your key"
        intro="Partitions move around; a client connecting fresh has to learn which node currently owns the key it wants. This is service discovery."
      >
        <Prose>
          <p>
            Once data is partitioned across nodes that come and go and rebalance, a client has a new problem: when it
            wants the key <code>user:42</code>, <strong>which IP address does it connect to?</strong> This is{" "}
            <strong>request routing</strong>, a special case of the general <strong>service discovery</strong>
            problem. There are three broad architectures:
          </p>
          <ul>
            <li>
              <strong>Contact any node.</strong> The client hits any node; if that node owns the partition it serves
              the request, otherwise it <em>forwards</em> to the right node and relays the answer (a gossip-style
              cluster where every node knows the map).
            </li>
            <li>
              <strong>Routing tier.</strong> All requests go through a partition-aware load balancer that knows the
              map and forwards to the correct node. The routing tier doesn&rsquo;t process queries itself; it just
              routes.
            </li>
            <li>
              <strong>Partition-aware client.</strong> The client itself knows the partition&ndash;to&ndash;node
              assignment and connects directly to the owner — one fewer network hop.
            </li>
          </ul>
          <p>
            In every case the hard part is the same: <strong>how does whoever makes the routing decision learn about
            changes</strong> in the partition&ndash;to&ndash;node assignment? A stale map sends requests to the wrong
            node. Many systems delegate this to a dedicated <strong>coordination service</strong> like{" "}
            <strong>ZooKeeper</strong>: each node registers itself, ZooKeeper holds the authoritative map, and routers
            or clients subscribe to changes. Others avoid a central dependency and use a <strong>gossip protocol</strong>,
            where nodes continuously exchange membership and assignment info among themselves.
          </p>
        </Prose>

        <Figure caption="Three routing architectures. The shared challenge is keeping the routing map current as partitions move.">
          <RoutingFigure />
        </Figure>

        <DefinitionGrid
          items={[
            {
              term: "Coordination service (ZooKeeper)",
              def: (
                <>
                  a separate, consistent store of cluster metadata; nodes register, routers/clients subscribe to the
                  authoritative partition map.
                </>
              ),
            },
            {
              term: "Gossip protocol",
              def: (
                <>
                  nodes periodically exchange membership and assignment state peer-to-peer, converging on a shared
                  view without a central coordinator.
                </>
              ),
            },
            {
              term: "Routing tier",
              def: <>a partition-aware load balancer that forwards each request to the node owning its key.</>,
            },
            {
              term: "MPP database",
              def: (
                <>
                  massively parallel processing — splits one complex analytic query into stages run across many
                  partitions in parallel.
                </>
              ),
            },
          ]}
        />

        <Callout variant="note">
          Routing and rebalancing are two halves of the same coin: rebalancing changes where partitions live, and the
          routing layer must learn the new map fast enough that clients don&rsquo;t keep knocking on the wrong door.
          A coordination service makes that propagation explicit and consistent; gossip makes it decentralized and
          eventually consistent.
        </Callout>

        <RealWorld
          examples={[
            {
              system: "HBase, SolrCloud, Kafka",
              detail: <>track partition/leader assignment in ZooKeeper; clients and brokers watch it for changes.</>,
            },
            {
              system: "MongoDB",
              detail: <>uses its own config servers (a replica set) plus mongos routers as the partition-aware tier.</>,
            },
            {
              system: "Cassandra & Riak",
              detail: (
                <>
                  use a gossip protocol — no central coordinator; any node can route because every node converges on
                  the ring state.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* ------------------------------------------------------- See it explained */}
      <Section
        id="see-it-explained"
        kicker="See it explained"
        title="Consistent hashing, on video"
        intro="A short, well-illustrated walk-through of the idea behind rebalancing without reshuffling everything — useful before or after driving the ring demo above."
      >
        <Prose>
          <p>
            Hussein Nasser&rsquo;s <em>Backend Engineering Show</em> explains why <code>hash(key) mod N</code> falls
            apart when <code>N</code> changes, and how the ring fixes it — the same algorithm that underpins Cassandra
            and DynamoDB. Watch it, then go back and add a node in the simulation to feel the difference.
          </p>
        </Prose>
        <YouTubeEmbed
          videoId="p6wwj0ozifw"
          title="Consistent Hashing — The Backend Engineering Show"
          channel="Hussein Nasser"
        />
      </Section>

      {/* ------------------------------------------------------- Further reading */}
      <Section
        id="further-reading"
        kicker="Go deeper"
        title="Primary sources & docs"
        intro="The original consistent-hashing paper, vendor docs that show how these ideas ship in production, and an engineering deep-dive on hot partitions at scale."
      >
        <FurtherReading
          sources={[
            {
              title: "Consistent Hashing and Random Trees (Karger et al., STOC 1997)",
              url: "https://www.cs.princeton.edu/courses/archive/fall09/cos518/papers/chash.pdf",
              note: "The original paper that coined consistent hashing — to relieve hot spots on the early Web.",
            },
            {
              title: "Partitions and data distribution in DynamoDB",
              url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.Partitions.html",
              note: "How DynamoDB hashes the partition key to place items, and how partitions split as data grows.",
            },
            {
              title: "Using Global Secondary Indexes in DynamoDB",
              url: "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html",
              note: "A worked example of a term-partitioned (global) index kept as its own partitioned table.",
            },
            {
              title: "Cassandra: data distribution & the token ring",
              url: "https://docs.datastax.com/en/cassandra-oss/3.0/cassandra/architecture/archPartitionerAbout.html",
              note: "The Murmur3 partitioner, tokens, and how vnodes spread each node over many small arcs.",
            },
            {
              title: "Vitess: Vindexes",
              url: "https://vitess.io/docs/reference/features/vindexes/",
              note: "How a sharded MySQL maps a column (the Primary Vindex) to a keyspace id, then routes queries.",
            },
            {
              title: "How Discord stores trillions of messages",
              url: "https://discord.com/blog/how-discord-stores-trillions-of-messages",
              note: "Hot partitions in practice: bucketing by channel + time, and the move to a shard-per-core engine.",
            },
          ]}
        />
      </Section>

      {/* ------------------------------------------------------- Test yourself */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            Generate a fresh set of questions on key-value partitioning, secondary indexes, rebalancing, and routing —
            then discuss any answer with the AI tutor, which is grounded in this exact chapter.
          </p>
        </Prose>
        <Quiz chapterTitle="Partitioning" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Partitioning" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Partitioning (sharding) splits one dataset so each record lives in exactly one partition; its purpose is scalability of both storage and throughput.",
          "Partitioning and replication are orthogonal: each partition is replicated for fault tolerance, and one node usually holds many partitions.",
          "Range partitioning keeps keys sorted (cheap scans) but invites hot spots on sequential keys; hash partitioning spreads load evenly but kills efficient range scans.",
          "No hash can fix a single hot key — the application must relieve it, e.g. by salting the key, trading write relief for extra read work.",
          "Secondary indexes are either document-partitioned (cheap writes, scatter/gather reads) or term-partitioned (single-partition reads, fan-out writes).",
          "Never rebalance with hash mod N — it remaps almost everything. Use a fixed/dynamic/per-node partition count or consistent hashing so only a fraction of keys move.",
          "Request routing (service discovery) keeps a current partition→node map via a coordination service like ZooKeeper or a gossip protocol; it must track rebalancing.",
        ]}
      />
    </ChapterShell>
  );
}

/* ====================================================================== *
 * Small static (server-rendered) SVG figures. These are presentational  *
 * only — no state or hooks — so they stay in the server component.       *
 * ====================================================================== */

function PartReplFigure() {
  const NODES = [
    { label: "Node 1", leaders: ["P0", "P3"], followers: ["P1"] },
    { label: "Node 2", leaders: ["P1"], followers: ["P0", "P2"] },
    { label: "Node 3", leaders: ["P2"], followers: ["P3"] },
  ];
  return (
    <svg viewBox="0 0 520 190" className="w-full">
      {NODES.map((n, i) => {
        const x = 24 + i * 168;
        return (
          <g key={n.label}>
            <rect x={x} y={20} width={150} height={150} rx={12} fill="var(--color-ink-900)" stroke="var(--color-line)" />
            <text x={x + 75} y={42} textAnchor="middle" className="fill-fg font-mono" fontSize={11}>
              {n.label}
            </text>
            {n.leaders.map((p, j) => (
              <g key={p}>
                <rect
                  x={x + 16 + j * 64}
                  y={58}
                  width={56}
                  height={30}
                  rx={6}
                  fill="color-mix(in oklab, var(--accent) 28%, var(--color-ink-800))"
                  stroke="var(--accent)"
                />
                <text x={x + 44 + j * 64} y={73} textAnchor="middle" className="fill-fg font-mono" fontSize={10}>
                  {p}
                </text>
                <text x={x + 44 + j * 64} y={84} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7}>
                  leader
                </text>
              </g>
            ))}
            {n.followers.map((p, j) => (
              <g key={p}>
                <rect
                  x={x + 16 + j * 64}
                  y={104}
                  width={56}
                  height={30}
                  rx={6}
                  fill="var(--color-ink-800)"
                  stroke="var(--color-line)"
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
                <text x={x + 44 + j * 64} y={119} textAnchor="middle" className="fill-fg-muted font-mono" fontSize={10}>
                  {p}
                </text>
                <text x={x + 44 + j * 64} y={130} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7}>
                  replica
                </text>
              </g>
            ))}
          </g>
        );
      })}
      <text x={260} y={184} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={8}>
        4 partitions (P0–P3) · leader + 1 replica each · spread over 3 nodes
      </text>
    </svg>
  );
}

function RoutingFigure() {
  return (
    <svg viewBox="0 0 520 220" className="w-full">
      {/* three columns */}
      {[
        { x: 10, title: "Any node forwards" },
        { x: 185, title: "Routing tier" },
        { x: 360, title: "Aware client" },
      ].map((c) => (
        <text key={c.title} x={c.x + 75} y={16} textAnchor="middle" className="fill-fg-muted font-mono" fontSize={9}>
          {c.title}
        </text>
      ))}

      {/* (1) any node forwards */}
      <g>
        <rect x={10} y={28} width={150} height={28} rx={7} fill="var(--color-ink-800)" stroke="var(--accent)" strokeOpacity={0.5} />
        <text x={85} y={46} textAnchor="middle" className="fill-fg font-mono" fontSize={9}>
          client
        </text>
        <path d="M85 56 V78" stroke="var(--color-line-strong)" strokeWidth={1.5} />
        <rect x={20} y={80} width={60} height={26} rx={6} fill="var(--color-ink-900)" stroke="var(--color-line)" />
        <text x={50} y={97} textAnchor="middle" className="fill-fg-muted font-mono" fontSize={8}>
          node A
        </text>
        <rect x={90} y={80} width={60} height={26} rx={6} fill="color-mix(in oklab, var(--accent) 22%, var(--color-ink-800))" stroke="var(--accent)" />
        <text x={120} y={97} textAnchor="middle" className="fill-fg font-mono" fontSize={8}>
          owns k
        </text>
        <path d="M80 93 H90" stroke="var(--accent)" strokeWidth={1.5} markerEnd="url(#arrow-a)" />
        <text x={85} y={124} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7.5}>
          A forwards to owner
        </text>
      </g>

      {/* (2) routing tier */}
      <g>
        <rect x={185} y={28} width={150} height={28} rx={7} fill="var(--color-ink-800)" stroke="var(--accent)" strokeOpacity={0.5} />
        <text x={260} y={46} textAnchor="middle" className="fill-fg font-mono" fontSize={9}>
          client
        </text>
        <path d="M260 56 V70" stroke="var(--color-line-strong)" strokeWidth={1.5} />
        <rect x={205} y={70} width={110} height={24} rx={6} fill="var(--color-ink-850)" stroke="var(--color-info)" />
        <text x={260} y={86} textAnchor="middle" className="fill-fg font-mono" fontSize={8}>
          routing tier
        </text>
        <path d="M260 94 V108" stroke="var(--color-line-strong)" strokeWidth={1.5} />
        <rect x={230} y={110} width={60} height={26} rx={6} fill="color-mix(in oklab, var(--accent) 22%, var(--color-ink-800))" stroke="var(--accent)" />
        <text x={260} y={127} textAnchor="middle" className="fill-fg font-mono" fontSize={8}>
          owns k
        </text>
      </g>

      {/* (3) aware client */}
      <g>
        <rect x={360} y={28} width={150} height={28} rx={7} fill="var(--color-ink-800)" stroke="var(--accent)" strokeOpacity={0.5} />
        <text x={435} y={46} textAnchor="middle" className="fill-fg font-mono" fontSize={9}>
          aware client
        </text>
        <path d="M435 56 V108" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" />
        <rect x={405} y={110} width={60} height={26} rx={6} fill="color-mix(in oklab, var(--accent) 22%, var(--color-ink-800))" stroke="var(--accent)" />
        <text x={435} y={127} textAnchor="middle" className="fill-fg font-mono" fontSize={8}>
          owns k
        </text>
        <text x={435} y={150} textAnchor="middle" className="fill-fg-faint font-mono" fontSize={7.5}>
          direct, no hop
        </text>
      </g>

      {/* coordination service underneath */}
      <rect x={120} y={172} width={280} height={32} rx={8} fill="var(--color-ink-850)" stroke="var(--color-special)" strokeDasharray="4 3" />
      <text x={260} y={192} textAnchor="middle" className="fill-fg-muted font-mono" fontSize={8.5}>
        ZooKeeper / gossip — authoritative partition → node map
      </text>
      {[85, 260, 435].map((x, i) => (
        <path key={i} d={`M${x} 138 V172`} stroke="var(--color-special)" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
      ))}

      <defs>
        <marker id="arrow-a" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6 z" fill="var(--accent)" />
        </marker>
      </defs>
    </svg>
  );
}
