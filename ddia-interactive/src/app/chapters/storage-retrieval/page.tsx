import type { Metadata } from "next";
import { Fragment } from "react";
import {
  ChapterShell,
  Section,
  Prose,
  Analogy,
  RealWorld,
  Callout,
  KeyTakeaways,
  DemoFrame,
  CompareTable,
  DefinitionGrid,
  Figure,
  CodeBlock,
  Quiz,
  AskClaude,
  YouTubeEmbed,
  FurtherReading,
} from "@/components/chapter";
import { Hero } from "./Hero";
import { LogStructuredDemo } from "./LogStructuredDemo";
import { BTreeDemo } from "./BTreeDemo";
import { EngineRace } from "./EngineRace";
import { ColumnStoreDemo } from "./ColumnStoreDemo";

export const metadata: Metadata = {
  title: "Storage & Retrieval",
  description:
    "How database storage engines lay bytes on disk and find them again: LSM-trees vs B-trees, OLTP vs OLAP, and column-oriented storage.",
};

const CONCEPTS = `Storage & Retrieval (DDIA Ch. 3). A database must do two things: store data and give it back. An INDEX is an additional structure derived from the primary data that speeds reads but slows writes, because every write must also update each index — so you choose indexes deliberately.

LOG-STRUCTURED engines. The simplest store is an append-only LOG plus an in-memory HASH INDEX mapping each key to a byte offset (Bitcask/Riak). Requirement: all keys fit in RAM; range queries are inefficient. To bound disk usage, break the log into SEGMENTS and run COMPACTION: discard duplicate keys, keeping only the newest value; merge segments in a background thread. Deletes use a TOMBSTONE record. Crash recovery, partial-write checksums, and a single writer thread are real-world concerns.

SSTABLES & LSM-TREES. Require each segment's key-value pairs sorted by key (Sorted String Table). Benefits: merging is a cheap mergesort; you need only a SPARSE in-memory index (one key per few KB); blocks can be compressed. Writes go to an in-memory balanced tree (MEMTABLE); when it exceeds a threshold it is flushed as a new immutable SSTable; a write-ahead log restores the memtable after a crash. Reads check memtable, then newest→oldest SSTables. A missing key is the slow case, so BLOOM FILTERS approximate set membership to skip segments. Compaction strategies: size-tiered (HBase, Cassandra) vs leveled (LevelDB, RocksDB). Lucene (Elasticsearch/Solr) stores its term dictionary similarly.

B-TREES. The most common index. Fixed-size PAGES/blocks (~4 KB) form a balanced tree of depth O(log n); one page is the root. Updates OVERWRITE a page in place; inserts into a full page SPLIT it into two half-full pages and update the parent. A WRITE-AHEAD LOG (redo log) makes splits crash-safe; LATCHES handle concurrency. Each key lives in exactly one place, giving clean range locks for transactions.

LSM vs B-TREE. LSM: higher write throughput, lower WRITE AMPLIFICATION (one logical write → many physical writes), better compression/smaller files; downside: compaction competes for I/O and is less predictable. B-trees: predictable, strong transactional semantics, faster reads.

OLTP vs OLAP. OLTP = many small transactions, indexed point lookups, user-facing. OLAP = analytics: scan huge numbers of rows, few columns, aggregate. A DATA WAREHOUSE is a separate read-only copy loaded by ETL, often a STAR SCHEMA (a large fact table of events surrounded by dimension tables).

COLUMN-ORIENTED STORAGE. Store each column's values together so a query reads only the columns it needs. Columns compress well (BITMAP ENCODING, run-length) and enable VECTORIZED processing. Downside: writes are hard (no in-place update of compressed columns; inserting a row may rewrite all column files). MATERIALIZED VIEWS / OLAP cubes cache common aggregates. Systems: Redshift, Vertica, Parquet, BigQuery/Dremel.`;

export default function Page() {
  return (
    <ChapterShell slug="storage-retrieval" diagram={<Hero />}>
      {/* ============================================================ INTRO */}
      <Section
        kicker="The layer beneath the data model"
        title="What a storage engine actually does"
        intro="A database does two jobs: when you give it data, it should store it; when you ask, it should give it back. Everything in this chapter is about the data structures that make the second job fast — and what they cost the first."
      >
        <Prose>
          <p>
            Chapters 1 and 2 stayed above the waterline — reliability, scalability, and the shape of the data
            model. This chapter goes <em>under</em> the database to the <strong>storage engine</strong>: the
            code that decides how bytes are laid out on disk and how they are found again. You rarely write one
            yourself, but you constantly choose between them. Knowing how they work is the difference between
            picking a database that fits your workload and fighting one that doesn&apos;t.
          </p>
          <p>
            The foundational primitive is the <strong>log</strong> — an append-only sequence of records.
            Appending is the fastest thing a disk can do, so many engines write that way. But a log alone is
            useless for lookups: to find one key among billions without scanning the whole file, you need an{" "}
            <strong>index</strong> — a secondary structure <em>derived</em> from the primary data. The central
            trade-off of the entire chapter falls out of that one sentence:
          </p>
          <ul>
            <li>
              A well-chosen index can turn an <code>O(n)</code> scan into an <code>O(1)</code> or{" "}
              <code>O(log n)</code> lookup.
            </li>
            <li>
              But <strong>every index slows writes</strong>, because each write must now update the data{" "}
              <em>and</em> every index that covers it.
            </li>
          </ul>
          <p>
            That is why databases don&apos;t index everything by default. They hand you the choice and expect
            you to know your query patterns. The two great families of index — <strong>log-structured</strong>{" "}
            (LSM-trees) and <strong>page-oriented</strong> (B-trees) — answer that read/write trade-off in
            opposite ways, and most of this chapter is a guided tour of how.
          </p>
        </Prose>

        <Callout variant="insight" title="The one idea to keep">
          Reads and writes pull in opposite directions. An index is a bet that you&apos;ll read a given access
          pattern often enough to justify the write cost of maintaining it. Storage engines are just different
          bets about which side of that trade matters more.
        </Callout>
      </Section>

      {/* =================================================== SECTION 1: ENGINES */}
      <Section
        id="sec-engines"
        kicker="Storage Engines (LSM vs B-Tree)"
        title="Two ways to find a key on disk"
        intro="Append everything and sort it later, or keep a balanced tree of pages you overwrite in place. Both give you fast lookups; they pay for it very differently."
      >
        <Prose>
          <p>
            Start with the simplest possible store: a file you only ever <strong>append</strong> to, plus an
            in-memory hash map from each key to its <strong>byte offset</strong> in that file. To write, append
            the key/value and update the map; to read, look up the offset and seek. This is essentially{" "}
            <strong>Bitcask</strong>, the default engine in Riak — superb when there are many writes per key and
            all <em>keys</em> (not values) fit in RAM.
          </p>
          <p>
            An append-only file would grow forever, so we break it into fixed-size <strong>segments</strong> and
            run <strong>compaction</strong> in the background: throw away superseded duplicates, keeping only the
            most recent value per key, and merge adjacent segments into a new file. Old segments are immutable,
            so they can be read concurrently while a single writer thread appends — which is exactly why this
            design is so simple to make crash-safe. Deletes are just another append: a special{" "}
            <strong>tombstone</strong> record that tells compaction to drop the key.
          </p>
          <p>
            The hash-index version has two hard limits: the index <strong>must fit in memory</strong>, and{" "}
            <strong>range queries are hopeless</strong> (adjacent keys are scattered across the file). The fix is
            to keep each segment <strong>sorted by key</strong> — a <strong>Sorted String Table (SSTable)</strong>
            . Sorting buys three things at once:
          </p>
          <ul>
            <li>
              <strong>Cheap merging.</strong> Merging sorted segments is a <code>mergesort</code> — stream them
              in parallel, emit the smallest key, prefer the newest segment on ties.
            </li>
            <li>
              <strong>A sparse index.</strong> You no longer index every key — one key per few kilobytes is
              enough. To find <code>handiwork</code>, find the offsets bracketing it (<code>handback</code>,{" "}
              <code>handsome</code>) and scan the gap.
            </li>
            <li>
              <strong>Block compression.</strong> Since reads scan a range anyway, group records into blocks and
              compress each block before writing.
            </li>
          </ul>
          <p>
            How do writes arrive sorted? They don&apos;t — you sort them in memory. Incoming writes land in a
            balanced tree (red-black/AVL) called the <strong>memtable</strong>. When it crosses a size threshold
            it&apos;s flushed to disk as a new immutable SSTable, and a fresh memtable takes over. A read checks
            the memtable, then each on-disk segment newest-to-oldest. To survive a crash before a flush, every
            write is first appended to a <strong>write-ahead log</strong> that exists only to rebuild the
            memtable. Engines built on this loop of <em>buffer → flush → merge sorted files</em> are{" "}
            <strong>Log-Structured Merge-Trees (LSM-trees)</strong>.
          </p>
        </Prose>

        <Analogy title="Analogy — the chef's order spike">
          A short-order cook doesn&apos;t reorganize a filing cabinet on every ticket. Orders get spiked on a
          rail in arrival order (the <em>log</em>); the cook keeps the active few in their head (the{" "}
          <em>memtable</em>). At a lull they copy finished tickets into a tidy sorted binder (an{" "}
          <em>SSTable</em>) and, now and then, merge two thin binders into one fat one, tossing cancelled orders
          (<em>compaction</em>). Fast to write because nothing is filed mid-rush; reads check the head first,
          then the newest binder, then older ones.
        </Analogy>

        <DemoFrame
          label="Try it yourself"
          title="Append-only log + memtable + SSTable compaction"
          description="Write keys into the memtable and watch it flush to an immutable sorted SSTable. Overwrites and a delete (tombstone) pile up across segments; compaction merges them and reclaims space. Then trace a read newest→oldest and watch write amplification climb."
          right={<span>LSM-tree</span>}
        >
          <LogStructuredDemo />
        </DemoFrame>

        <Callout variant="note" title="Why a miss is the slow case">
          A read for a key that doesn&apos;t exist must check the memtable and <em>every</em> segment before
          giving up. LSM engines add a <strong>Bloom filter</strong> per segment — a tiny probabilistic set
          that can say &ldquo;definitely not here&rdquo; and let a read skip the segment entirely. False
          positives are possible; false negatives are not.
        </Callout>

        <Prose>
          <p>
            <strong>B-trees</strong> take the opposite stance and are, by a wide margin, the most common index
            in production databases. Instead of variable-size segments, a B-tree breaks the data into fixed-size{" "}
            <strong>pages</strong> (traditionally 4&nbsp;KB) arranged as a balanced tree. One page is the{" "}
            <strong>root</strong>; each page holds sorted keys and pointers to child pages, and you descend until
            you hit the leaf that holds your key. Because the tree stays balanced, depth is <code>O(log n)</code>
            — a tree four or five levels deep can index an enormous dataset.
          </p>
          <p>
            The defining move is that B-trees <strong>overwrite pages in place</strong>. To update a key, find
            its leaf, change the bytes, write the page back to the <em>same location</em> on disk so every
            pointer to it stays valid. To insert into a full page, <strong>split</strong> it into two half-full
            pages and update the parent to reference both. That split is the dangerous moment: it touches
            several pages, and a crash partway through would corrupt the tree. So B-trees keep their own{" "}
            <strong>write-ahead log</strong> (the redo log) and guard the in-memory structures with{" "}
            <strong>latches</strong> (lightweight locks) for concurrency.
          </p>
        </Prose>

        <DemoFrame
          label="Try it yourself"
          title="B-tree pages updated in place"
          description="Insert keys and watch them land in the correct leaf page. An update rewrites exactly one page; a full page splits — rewriting two halves plus the parent. Compare the write-amplification number here to the LSM demo above."
          right={<span>B-tree</span>}
        >
          <BTreeDemo />
        </DemoFrame>

        <Prose>
          <p>
            So which wins? Neither — they trade. <strong>LSM-trees are usually faster for writes</strong> because
            they turn random updates into sequential appends and often have <strong>lower write
            amplification</strong> (one logical write fanning out into fewer physical writes), and they compress
            into smaller files. <strong>B-trees are usually faster for reads</strong> and far more{" "}
            <strong>predictable</strong>: a lookup follows one path to one page, whereas an LSM read may consult
            the memtable and several SSTables at different compaction stages.
          </p>
        </Prose>

        <DemoFrame
          label="Try it yourself"
          title="Same writes, two engines — race them"
          description="Fan one identical stream of writes into both an LSM-tree and a B-tree at once. Watch the LSM batch sequential appends and flush sorted segments while the B-tree does random in-place page overwrites and splits — and watch the two write-amplification bars diverge. Compaction reclaims LSM space on demand."
          right={<span>LSM vs B-Tree</span>}
        >
          <EngineRace />
        </DemoFrame>

        <CompareTable
          columns={["LSM-Tree", "B-Tree"]}
          rows={[
            {
              feature: "Write path",
              values: [
                "Append to memtable + WAL; flush whole sorted segments. Sequential I/O.",
                "Locate leaf, overwrite the 4 KB page in place. Random I/O.",
              ],
            },
            {
              feature: "Read path",
              values: [
                "Check memtable, then SSTables newest→oldest (Bloom filters help skip).",
                <Fragment key={1}>One root-to-leaf descent: <code>O(log n)</code> pages.</Fragment>,
              ],
            },
            {
              feature: "Write amplification",
              values: [
                "Lower on average, but compaction rewrites data repeatedly.",
                "~1 page per update; spikes only on splits.",
              ],
            },
            {
              feature: "Throughput vs predictability",
              values: [
                "High write throughput; compaction can stall reads/writes unpredictably.",
                "Steadier latency; no background merge competing for I/O.",
              ],
            },
            {
              feature: "On disk",
              values: [
                "Compresses well; smaller files.",
                "Fragmentation leaves pages partly empty.",
              ],
            },
            {
              feature: "Transactions",
              values: [
                "A key may exist in several segments at once.",
                "Each key lives in exactly one place → clean range locks.",
              ],
            },
          ]}
          caption="The same job, opposite bets: append-and-merge vs overwrite-in-place."
        />

        <DefinitionGrid
          items={[
            { term: "Memtable", def: <>In-memory balanced tree buffering recent writes in sorted order before a flush.</> },
            { term: "SSTable", def: <>Sorted String Table — an immutable on-disk segment whose key/value pairs are sorted by key.</> },
            { term: "Compaction", def: <>Background merge of segments that drops superseded values and tombstones, reclaiming space.</> },
            { term: "Tombstone", def: <>A deletion marker appended to the log so compaction knows to discard a key&apos;s older values.</> },
            { term: "Write amplification", def: <>The ratio of physical bytes written to disk per logical write the application issued.</> },
            { term: "Bloom filter", def: <>A compact probabilistic set used to skip SSTables that definitely don&apos;t hold a key.</> },
            { term: "Page / block", def: <>The fixed-size unit (≈4&nbsp;KB) a B-tree reads, writes, and splits.</> },
            { term: "Write-ahead log (WAL)", def: <>An append-only redo log written before mutating structures so a crash can be recovered.</> },
          ]}
        />

        <RealWorld
          examples={[
            { system: "Bitcask (Riak)", detail: <>Append-only log with an all-in-RAM hash index — the canonical hash-index engine. Recovers the index from a compacted &ldquo;hint&rdquo; file at startup.</> },
            { system: "LevelDB → RocksDB", detail: <>LevelDB was written at Google by Jeff Dean &amp; Sanjay Ghemawat (the BigTable/SSTable authors); Facebook&apos;s RocksDB forks it and is now embedded inside MySQL, CockroachDB, TiKV and more. The memtable is a skip list; classic leveled compaction can push total write amplification into the tens (≈1+2+10+10+10 ≈ 33 at a 10× level ratio).</> },
            { system: "Cassandra / ScyllaDB / HBase", detail: <>LSM stores. Cassandra and ScyllaDB offer both size-tiered (lower write-amp, higher space-amp) and leveled compaction; HBase descends from BigTable&apos;s size-tiered design.</> },
            { system: "PostgreSQL / MySQL (InnoDB)", detail: <>Classic B-tree primary indexes (InnoDB clusters the table on its primary-key B-tree) with a write-ahead/redo log for crash recovery — the still-dominant OLTP layout.</> },
            { system: "Lucene (Elasticsearch / Solr)", detail: <>Its term dictionary lives in immutable, periodically-merged segments; the term→postings map is a finite-state transducer, an SSTable-flavoured idea.</> },
          ]}
        />

        <Callout variant="tradeoff" title="It's a workload question">
          Write-heavy, ingest-style workloads (logs, time series, event streams) lean LSM. Read-heavy workloads
          that want predictable latency and transactional range locks lean B-tree. &ldquo;Which is faster&rdquo;
          has no answer without &ldquo;at what?&rdquo;
        </Callout>
      </Section>

      {/* ===================================================== SECTION 2: OLTP/OLAP */}
      <Section
        id="sec-oltp-olap"
        kicker="OLTP vs OLAP"
        title="Two workloads, two databases"
        intro="The same SQL can serve a checkout button or a quarterly revenue report — but the access patterns are so different that we build separate systems for each."
      >
        <Prose>
          <p>
            A <strong>transaction</strong> is just a group of reads and writes treated as one logical unit (the
            word is historical — it need not involve money). The interactive, user-facing pattern of many small
            transactions, each touching a handful of rows by key, became known as{" "}
            <strong>online transaction processing (OLTP)</strong>. It is latency-sensitive and dominated by
            indexed point lookups and small writes — exactly what the B-trees and LSM-trees above are tuned for.
          </p>
          <p>
            <strong>Analytics</strong> has the opposite shape. An analyst&apos;s query scans a{" "}
            <strong>huge number of rows</strong>, reads only a <strong>few columns</strong> of each, and
            computes an aggregate — a sum, count, or average — to feed a report. This pattern is{" "}
            <strong>online analytic processing (OLAP)</strong>. Running heavy OLAP scans against the live OLTP
            database would crush the very system answering customer requests, so analytics moved into a separate{" "}
            <strong>data warehouse</strong>: a read-only copy of data extracted from the company&apos;s OLTP
            systems, transformed into an analysis-friendly schema, and loaded in — the{" "}
            <strong>Extract–Transform–Load (ETL)</strong> pipeline.
          </p>
          <p>
            Warehouses are usually modelled as a <strong>star schema</strong>: one enormous{" "}
            <strong>fact table</strong> where each row is an individual event (a sale, a click, a page view),
            surrounded by smaller <strong>dimension tables</strong> describing the <em>who, what, where, when,
            how and why</em> of those events. Drawn out, the fact table sits at the center with dimensions
            radiating like the points of a star. Fact tables routinely have hundreds of columns and billions of
            rows — which is precisely what makes the storage layout in the next section matter so much.
          </p>
        </Prose>

        <CompareTable
          columns={["OLTP", "OLAP"]}
          rows={[
            { feature: "Read pattern", values: ["A few rows fetched by key.", "Aggregate over millions of rows."] },
            { feature: "Write pattern", values: ["Low-latency inserts/updates from user actions.", "Bulk load via ETL / event stream."] },
            { feature: "Columns touched", values: ["Most columns of a few rows.", "A few columns of most rows."] },
            { feature: "Who runs it", values: ["End users, via an application.", "Analysts & dashboards."] },
            { feature: "Data size", values: ["GB–TB of current state.", "TB–PB of historical events."] },
            { feature: "Bottleneck", values: ["Disk seek / index lookup latency.", "Disk bandwidth (bytes scanned)."] },
          ]}
          caption="OLTP optimizes for seeks; OLAP optimizes for scan throughput."
        />

        <Analogy title="Analogy — the shop till vs the accountant">
          The till at the front of the shop rings up one customer at a time, fast, all day (OLTP). At night the
          accountant takes a <em>copy</em> of the day&apos;s receipts to a back office and asks sweeping
          questions — &ldquo;total mug sales in Germany this quarter?&rdquo; (OLAP). You would never make the
          accountant work at the till while customers wait, and you&apos;d never run the quarter&apos;s books on
          the till&apos;s receipt printer. Different tools, fed by a nightly <em>ETL</em> of the receipts.
        </Analogy>

        <Figure caption="Star schema — one large fact table of events, ringed by dimension tables.">
          <svg viewBox="0 0 520 240" className="w-full" role="img" aria-label="Star schema diagram">
            {/* dimension tables */}
            {[
              { x: 40, y: 24, label: "dim_date" },
              { x: 360, y: 24, label: "dim_product" },
              { x: 40, y: 168, label: "dim_store" },
              { x: 360, y: 168, label: "dim_customer" },
            ].map((d) => (
              <g key={d.label}>
                <line x1="260" y1="120" x2={d.x + 60} y2={d.y + 22} stroke="var(--color-line-strong)" strokeWidth="1" />
                <rect x={d.x} y={d.y} width="120" height="44" rx="8" fill="var(--color-ink-850)" stroke="var(--color-line)" strokeWidth="1" />
                <text x={d.x + 60} y={d.y + 27} textAnchor="middle" className="fill-fg-muted font-mono" fontSize="11">
                  {d.label}
                </text>
              </g>
            ))}
            {/* fact table */}
            <rect x="195" y="92" width="130" height="56" rx="10" fill="color-mix(in oklab, var(--accent) 16%, var(--color-ink-850))" stroke="var(--accent)" strokeWidth="1.6" />
            <text x="260" y="116" textAnchor="middle" className="fill-fg font-mono" fontSize="12">
              fact_sales
            </text>
            <text x="260" y="134" textAnchor="middle" className="fill-fg-faint font-mono" fontSize="9">
              billions of rows · 100+ cols
            </text>
          </svg>
        </Figure>

        <RealWorld
          examples={[
            { system: "Amazon Redshift", detail: <>A hosted, column-oriented warehouse (descended from ParAccel).</> },
            { system: "Google BigQuery", detail: <>Serverless analytics built on ideas from Google&apos;s Dremel paper.</> },
            { system: "Apache Hive / Spark SQL / Presto", detail: <>SQL query engines that scan large datasets on a distributed filesystem.</> },
            { system: "Snowflake / Vertica", detail: <>Modern columnar warehouses separating storage from compute.</> },
          ]}
        />

        <Callout variant="warning" title="Don't run analytics on your OLTP database">
          A single unbounded analytic scan can saturate the disk and buffer cache that your customer-facing
          queries depend on, spiking p99 latency for everyone. That operational reality — not SQL syntax — is
          the real reason warehouses exist as separate systems.
        </Callout>
      </Section>

      {/* ============================================ SECTION 3: COLUMN STORAGE */}
      <Section
        id="sec-columns"
        kicker="Column-Oriented Storage"
        title="Store columns, not rows"
        intro="If analytic queries read a few columns of billions of rows, stop storing rows together. Store each column together — then you only pay for the columns you actually read."
      >
        <Prose>
          <p>
            In a <strong>row-oriented</strong> engine, all values of one row sit together on disk. To answer{" "}
            <code>SELECT product, SUM(qty) … GROUP BY product</code> over a fact table with a hundred columns,
            the engine must load <em>every field of every row</em> into memory, then discard the 98 columns it
            didn&apos;t want. The disk bandwidth spent on unwanted columns dominates the query.
          </p>
          <p>
            <strong>Column-oriented storage</strong> flips the layout: store all the values of each{" "}
            <em>column</em> together, typically in a separate file. Now a query reads only the columns it
            references — two files instead of a hundred — and the bytes pulled off disk drop proportionally.
            Because the rows stay in the same order across every column file, the database reassembles a row by
            taking the <code>n</code>-th entry from each column it needs.
          </p>
          <p>
            The second win is <strong>compression</strong>. A single column is far more repetitive than a row —
            a <code>country</code> column is a long run of <code>US, US, US, DE…</code> — and repetitive data
            compresses beautifully. <strong>Bitmap encoding</strong> (one bitmap per distinct value) and{" "}
            <strong>run-length encoding</strong> can shrink low-cardinality columns dramatically, and bitmaps
            turn <code>WHERE country IN (…)</code> into fast bitwise <code>AND</code>/<code>OR</code>. Tightly
            packed columns also let the CPU rip through them with <strong>vectorized processing</strong> — operating
            on whole compressed chunks in tight loops that stay in L1 cache, instead of chasing one row at a
            time.
          </p>
        </Prose>

        <DemoFrame
          label="Try it yourself"
          title="Row vs column layout for an analytic query"
          description="The query reads only product and qty. Flip the storage layout and watch how many cells must be read off disk — and toggle column compression to collapse repeated values via run-length encoding."
          right={<span>OLAP scan</span>}
        >
          <ColumnStoreDemo />
        </DemoFrame>

        <Analogy title="Analogy — the spreadsheet exported two ways">
          Picture a giant spreadsheet saved to disk. Save it <em>by row</em> and to total one column you must
          read every cell in the file and ignore most of them. Save it <em>by column</em> — each column its own
          file — and to total a column you open just that one file. And since a column is full of repeats
          (&ldquo;US, US, US…&rdquo;), you can store &ldquo;US ×&nbsp;1,200&rdquo; instead of writing it 1,200
          times.
        </Analogy>

        <Callout variant="tradeoff" title="Cheap reads, expensive writes">
          Column storage assumes a read-mostly, bulk-loaded world. You <strong>cannot</strong> update a
          compressed column in place the way a B-tree updates a page — inserting a row in the middle of a sorted,
          compressed table could mean rewriting every column file. That&apos;s an easy trade in a warehouse
          loaded by ETL, and a terrible one for OLTP.
        </Callout>

        <Prose>
          <p>
            To make the most common queries even faster, warehouses precompute answers. A{" "}
            <strong>materialized view</strong> is an actual on-disk copy of a query&apos;s result (unlike a plain{" "}
            <em>virtual view</em>, which is only a saved query that re-runs each time). A common special case is
            the <strong>data cube</strong> or <strong>OLAP cube</strong>: a grid of aggregates pre-grouped along
            several dimensions, so &ldquo;sales by product by region by month&rdquo; is a lookup, not a scan. The
            catch is the same trade as any index — when the underlying facts change, the materialized copy must
            be rebuilt, making writes more expensive.
          </p>
        </Prose>

        <CodeBlock
          lang="sql"
          caption="A materialized view caches an aggregate; reads hit the copy, writes must refresh it."
          code={`CREATE MATERIALIZED VIEW sales_by_product AS
SELECT product, country,
       SUM(qty)   AS units,
       SUM(price) AS revenue
FROM   fact_sales
GROUP BY product, country;   -- a 2-dimension slice of an OLAP cube`}
        />

        <RealWorld
          examples={[
            { system: "C-Store → Vertica", detail: <>The 2005 MIT/Brown/Brandeis C-Store paper (Stonebraker et al.) defined the modern column store: data stored by column, packed and bitmap-indexed, kept in several overlapping sort orders (&ldquo;projections&rdquo;). It was commercialized as Vertica.</> },
            { system: "Apache Parquet / ORC", detail: <>Open columnar file formats: values are grouped into column chunks with per-column dictionary, run-length and bit-packing encodings, so a scan reads only the referenced columns. The storage backbone of the lake/Spark/Presto world.</> },
            { system: "Amazon Redshift / Snowflake / BigQuery", detail: <>Cloud warehouses with columnar storage. BigQuery&apos;s engine grew out of Google&apos;s Dremel paper; Snowflake and Redshift separate columnar storage from elastic compute.</> },
            { system: "ClickHouse / DuckDB", detail: <>Modern vectorized column engines — DuckDB is an in-process OLAP database (the &ldquo;SQLite for analytics&rdquo;), ClickHouse a distributed one — both built around compressed columns and SIMD scans.</> },
          ]}
        />
      </Section>

      {/* ===================================================== SEE IT EXPLAINED */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Watch the engine work"
        intro="Two short explainers: an animated walkthrough of how an LSM-tree turns writes into sequential I/O, and a chapter-3 companion that contrasts LSM-trees with B-trees the way this page does."
      >
        <Prose>
          <p>
            The first video (ByteByteGo) animates the exact loop the demos above let you drive — a write hits the
            in-memory memtable, flushes to an immutable sorted SSTable, and is later merged by compaction — and
            ties it to why LSM stores like Cassandra and DynamoDB ingest writes so fast. The second walks through
            this chapter&apos;s storage-and-retrieval material directly, comparing log-structured and
            page-oriented engines.
          </p>
        </Prose>

        <YouTubeEmbed
          videoId="I6jB0nM9SKU"
          title="The Secret Sauce Behind NoSQL: LSM Tree"
          channel="ByteByteGo"
        />

        <YouTubeEmbed
          videoId="4z7-SrDiBoU"
          title="Chapter 3 — Storage and Retrieval (LSM-trees and B-trees)"
          channel="DDIA chapter walkthrough"
        />
      </Section>

      {/* ====================================================== TEST YOURSELF */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <FurtherReading
          title="Go to the sources"
          sources={[
            {
              title: "The Log-Structured Merge-Tree (LSM-Tree) — O'Neil, Cheng, Gawlick & O'Neil, 1996",
              url: "https://en.wikipedia.org/wiki/Log-structured_merge-tree",
              note: "The design that defined the memtable → merge-to-disk pattern behind Cassandra, HBase and RocksDB (links the original Acta Informatica paper).",
            },
            {
              title: "Organization and Maintenance of Large Ordered Indexes — Bayer & McCreight, 1972",
              url: "https://infolab.usc.edu/csci585/Spring2010/den_ar/indexing.pdf",
              note: "The B-tree's founding paper; see also Comer's 1979 survey \"The Ubiquitous B-Tree\".",
            },
            {
              title: "RocksDB Wiki — Compaction & Leveled Compaction",
              url: "https://github.com/facebook/rocksdb/wiki/Compaction",
              note: "How a production LSM engine actually flushes and merges — and the write-/read-/space-amplification trade-offs of each strategy.",
            },
            {
              title: "LevelDB implementation notes (doc/impl.md)",
              url: "https://github.com/google/leveldb/blob/main/doc/impl.md",
              note: "Google's compact LSM reference: memtable, log, sorted-table files, and the leveled compaction picture.",
            },
            {
              title: "C-Store: A Column-oriented DBMS — Stonebraker et al., VLDB 2005",
              url: "https://web.stanford.edu/class/cs345d-01/rl/cstore.pdf",
              note: "Column storage, heavy compression, bitmap indexes and overlapping sort orders — the basis for Vertica and modern warehouses.",
            },
            {
              title: "SSTable and Log-Structured Storage: LevelDB — Ilya Grigorik",
              url: "https://www.igvita.com/2012/02/06/sstable-and-log-structured-storage-leveldb/",
              note: "A clear engineering walkthrough of SSTables, memtables and the BigTable lineage.",
            },
          ]}
        />
        <Prose>
          <p>
            Generate a fresh set of questions to check your grasp of indexes, LSM-trees, B-trees, and column
            storage — then ask the tutor to go deeper on anything that didn&apos;t click.
          </p>
        </Prose>
        <Quiz chapterTitle="Storage &amp; Retrieval" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Storage &amp; Retrieval" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "A database stores data and gives it back; an index is a derived structure that speeds reads but slows every write — so you choose indexes to match your query patterns.",
          "Log-structured engines (LSM-trees) buffer writes in a sorted memtable, flush immutable SSTables, and compact them in the background — turning random writes into sequential I/O.",
          "Reads in an LSM-tree check the memtable then SSTables newest→oldest; a missing key is the slow case, which is why Bloom filters exist.",
          "B-trees keep a balanced tree of fixed-size pages and overwrite them in place; splits are the costly, crash-sensitive case guarded by a write-ahead log.",
          "LSM-trees favor write throughput and compression; B-trees favor predictable read latency and clean transactional locking — the right pick is a workload question.",
          "OLTP (small indexed transactions) and OLAP (huge aggregate scans) diverge so sharply that analytics moves to a separate, ETL-loaded data warehouse, often a star schema.",
          "Column-oriented storage reads only the columns a query touches and compresses each column hard (bitmap/run-length) — fast for read-mostly analytics, costly for writes.",
        ]}
      />
    </ChapterShell>
  );
}
