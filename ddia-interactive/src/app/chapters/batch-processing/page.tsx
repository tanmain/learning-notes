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
import { WordCountLab } from "./WordCountLab";
import { MapReduceDemo } from "./MapReduceDemo";
import { JoinSkewDemo } from "./JoinSkewDemo";
import { DataflowDemo } from "./DataflowDemo";

export const metadata: Metadata = { title: "Batch Processing" };

const CONCEPTS = `Batch processing handles bounded, large input datasets: a job reads input, runs a computation, and produces output, without responding to live requests (unlike online services) and without the never-ending input of stream processing. Its quality metric is throughput, not response time.

Unix philosophy: small tools (awk, sort, uniq, grep) composed via pipes, each reading stdin and writing stdout, communicating through a uniform interface (a file = an ordered sequence of bytes, by convention ASCII text). Example: cat access.log | awk '{print $7}' | sort | uniq -c | sort -rn | head -n5 finds the most popular URLs. Tools handle larger-than-memory data and parallelize sorting across cores. Programs avoid side effects and don't care where input comes from or output goes (loose coupling, easy inspection).

MapReduce generalizes this across a cluster on a distributed filesystem (HDFS), which is shared-nothing: a daemon per machine, a central NameNode tracking which blocks live where, file blocks replicated (or erasure-coded with Reed-Solomon). A job: (1) read & split input into records, (2) mapper extracts (key,value) per record, (3) framework sorts all pairs by key, (4) reducer iterates over all values for each key. The mapper/reducer process one record at a time and don't manage parallelism. The scheduler puts computation near the data (run mapper on a node holding a replica). Number of map tasks = input blocks; number of reduce tasks = configured; hash(key) routes pairs to reducers. SHUFFLE = partition by reducer + sort + copy mapper outputs to reducers; reducers merge-sort the streams. Jobs chain into workflows (output dir of one = input of next).

Joins: MapReduce has no indexes; it does a full scan (sort-merge join, or map-side/broadcast join when one side fits in memory). Bring data into the same filesystem rather than querying a remote DB over the network (too slow/nondeterministic). Hot keys / linchpin objects cause skew: one reducer overloaded. Skewed join (Pig) samples to find hot keys then replicates their records across all reducers; Crunch/Hive have similar shared/map-side joins.

Output is often a new read-only database built inside the job and bulk-loaded (Voldemort, ElephantDB, HBase), never written record-by-record to a live DB. Immutable inputs + no side effects = failed tasks re-run safely, easy maintenance, human fault tolerance. At Google a 1-hour MapReduce task had ~5% chance of being killed for higher-priority work, so MR tolerates frequent termination and eagerly writes to disk.

MapReduce vs MPP databases: MPP runs parallel analytic SQL, aborts the whole query on a crash, keeps data in memory; MapReduce is a general-purpose OS-like engine, tolerates task failure, writes to disk, schema-on-read (interpretation is the consumer's problem). Higher-level languages: Pig, Hive, Cascading, Crunch. Beyond MapReduce: dataflow engines (Spark, Tez, Flink) run a whole workflow as one job of flexible operators, avoid fully materializing intermediate state to HDFS, and recover from faults by recomputing lost partitions from lineage (Spark RDD) or checkpoints (Flink). Graphs: iterative "repeat until done" needs the bulk synchronous parallel / Pregel model (Giraph, GraphX, Gelly) where vertices keep state across iterations and communicate by batched messages, checkpointed for fault tolerance.`;

export default function Page() {
  return (
    <ChapterShell slug="batch-processing" diagram={<Hero />}>
      {/* ---------------------------------------------------------------- intro */}
      <Section
        kicker="The third kind of system"
        title="Bounded data, crunched offline"
        intro={
          <>
            Online <em>services</em> wait for a request and answer it fast. <em>Stream</em> processors react to
            events the moment they happen. <strong>Batch processing</strong> is the third species: it takes a
            large, <em>bounded</em> dataset, runs a job over all of it, and emits an output. Nobody is waiting on
            the other end of a socket — so the metric that matters is <em>throughput</em>, not latency.
          </>
        }
      >
        <Prose>
          <p>
            This chapter traces one idea through three generations of tooling. It starts with the{" "}
            <strong>Unix philosophy</strong> from the 1970s — tiny programs glued together with pipes — shows how{" "}
            <strong>MapReduce</strong> scaled that exact philosophy across thousands of machines, and ends with the{" "}
            <strong>dataflow engines</strong> (Spark, Flink, Tez) that fixed MapReduce&apos;s rough edges. The thread
            tying them together is a small set of design principles: <em>immutable inputs</em>, <em>pure
            functions</em> with no side effects, and a clean separation between &quot;move the data to the right
            place&quot; and &quot;compute on the data once it&apos;s here.&quot; Get those right and you inherit
            something precious: a job that fails halfway can simply be run again, because nothing it read has
            changed underneath it.
          </p>
        </Prose>
        <Callout variant="insight">
          The whole chapter rhymes with one sentence: <strong>treat inputs as immutable and avoid side effects</strong>,
          and large-scale data processing becomes both fast and easy to operate. Everything else — MapReduce, HDFS,
          Spark — is machinery in service of that principle.
        </Callout>
      </Section>

      {/* ---------------------------------------------------------------- Unix */}
      <Section
        id="unix"
        kicker="Unix Tools"
        title="Pipes, files, and the uniform interface"
        intro={
          <>
            Before any cluster, the original batch processor was your laptop. A pipeline of small Unix tools can
            answer surprisingly heavy analytics questions — and it already embodies the ideas the rest of the
            chapter scales up.
          </>
        }
      >
        <Prose>
          <p>
            Say you want the five most-requested URLs from an <code>nginx</code> access log. You don&apos;t need a
            database — you need five programs that each do one thing, wired together so the output of one becomes
            the input of the next:
          </p>
        </Prose>

        <CodeBlock
          lang="bash"
          caption="Each | hands a stream of bytes to the next program. sort groups identical lines together so uniq -c can count them."
          code={`cat /var/log/nginx/access.log \\
  | awk '{print $7}'   # pull out just the requested URL (7th field)
  | sort               # bring identical URLs next to each other
  | uniq -c            # collapse runs of duplicates into "count URL"
  | sort -rn           # sort by that count, descending
  | head -n 5          # keep the top five`}
        />

        <Prose>
          <p>
            Why is this more than a party trick? Because <code>sort</code> is doing real engineering for you. If
            the log is bigger than RAM, GNU <code>sort</code> automatically <em>spills</em> sorted chunks to disk
            and merges them, and it <em>parallelizes</em> across CPU cores. You wrote a one-liner; you got an
            external-memory, multi-core sort for free. The same program written by hand in Python would happily run
            out of memory.
          </p>
          <p>
            The deeper lesson is the <strong>uniform interface</strong>. Every tool reads from <code>stdin</code>{" "}
            and writes to <code>stdout</code>, and treats the data as an ordered sequence of bytes — by convention,
            lines of ASCII text. Because they all agree on this one shape, <em>any</em> tool can feed{" "}
            <em>any</em> other. None of them know or care whether their input is a file, a keyboard, or another
            program; the shell wires that up. That loose coupling is exactly what lets you snap the pieces together
            in combinations their authors never imagined — and it&apos;s why you can stick a <code>tee</code> or a{" "}
            <code>less</code> mid-pipeline to <em>see what&apos;s going on</em>.
          </p>
        </Prose>

        <Analogy>
          A Unix pipeline is a <strong>factory conveyor belt</strong>. Each station does one small operation —
          stamp, sort, count — and slides the part to the next station. No station hoards parts or reaches across
          the floor to another machine; it just transforms what slides past and pushes it on. You can re-arrange
          stations, or watch parts go by at any point, precisely because they all speak the same &quot;part on a
          belt&quot; interface.
        </Analogy>

        <DefinitionGrid
          items={[
            {
              term: "stdin / stdout",
              def: <>The standard input and output streams. A program that only uses them lets the shell decide where data comes from and goes — the source of Unix&apos;s composability.</>,
            },
            {
              term: "Uniform interface",
              def: <>Every tool agrees data is a byte stream of newline-separated records. One shared shape means any tool composes with any other.</>,
            },
            {
              term: "External sort",
              def: <><code>sort</code> spills to disk and merges, handling datasets larger than memory — a preview of how MapReduce sorts across a cluster.</>,
            },
            {
              term: "No side effects",
              def: <>Tools read input and write output without mutating the world, so a pipeline is safe to re-run and easy to reason about.</>,
            },
          ]}
        />

        <RealWorld
          examples={[
            { system: "GNU coreutils", detail: <><code>sort</code>, <code>uniq</code>, <code>cut</code>, <code>awk</code> still power ad-hoc log analysis; <code>sort</code>&apos;s external-merge and parallel modes are the unsung hero.</> },
            { system: "jq", detail: <>The &quot;awk for JSON&quot; — a modern tool that kept the stdin/stdout pipe contract so it drops straight into existing pipelines.</> },
            { system: "Hadoop Streaming", detail: <>Lets you write MapReduce mappers and reducers as ordinary programs that read stdin and write stdout — literally Unix tools, distributed.</> },
          ]}
        />

        <Callout variant="tradeoff">
          The Unix model&apos;s great limitation is that it runs on <strong>one machine</strong>. The pipeline is
          beautiful, but a single host&apos;s disks and cores cap how much data you can chew through. MapReduce&apos;s
          entire reason to exist is to keep this programming model while spreading the work across a cluster.
        </Callout>
      </Section>

      {/* -------------------------------------------------------- MapReduce */}
      <Section
        id="mapreduce"
        kicker="MapReduce & Distributed Filesystems"
        title="The Unix pipeline, distributed"
        intro={
          <>
            A single MapReduce job is the cluster-scale analogue of a single Unix process: read input, transform,
            write output, no side effects. The difference is where the data lives (a distributed filesystem) and
            how the magic step — <em>sorting</em> — is spread across many machines.
          </>
        }
      >
        <Prose>
          <p>
            Instead of <code>stdin</code>/<code>stdout</code>, MapReduce jobs read and write files on a{" "}
            <strong>distributed filesystem</strong> — in Hadoop, <strong>HDFS</strong>. HDFS follows the{" "}
            <em>shared-nothing</em> principle: a daemon runs on every machine exposing that machine&apos;s local
            disks over the network, a central <strong>NameNode</strong> tracks which file blocks sit on which
            machine, and each block is replicated to several machines (or stored with an erasure code like
            Reed–Solomon so lost data can be reconstructed). No exotic shared-storage appliance required — just
            commodity machines and their disks, pooled into one giant filesystem.
          </p>
          <p>A MapReduce job is exactly four steps, and only two of them are <em>your</em> code:</p>
          <ul>
            <li><strong>Split</strong> the input files into records (e.g. one line = one record).</li>
            <li>Call your <strong>mapper</strong> once per record; it emits zero or more <code>(key, value)</code> pairs.</li>
            <li>The framework <strong>sorts</strong> every emitted pair by key — this is the part you don&apos;t write.</li>
            <li>Call your <strong>reducer</strong> once per distinct key, handing it an iterator over <em>all</em> values for that key.</li>
          </ul>
          <p>
            Mapper and reducer each see only one record (or one key&apos;s values) at a time; they have no idea
            where their input came from or where their output goes. That ignorance is the whole point — it lets the
            framework run thousands of them in parallel without you writing a line of concurrency code. The
            scheduler even tries to <strong>put the computation near the data</strong>, launching a mapper on a
            machine that already holds a replica of its input block, so the data never has to cross the network to
            be read.
          </p>
        </Prose>

        <Figure caption="The shuffle is the heart of MapReduce: partition every key by hash to a reducer, sort within each partition, and copy partitions from every mapper to the owning reducer.">
          <svg viewBox="0 0 620 230" className="w-full" role="img" aria-label="MapReduce shuffle diagram">
            {/* mappers */}
            {[0, 1, 2].map((m) => (
              <g key={`m${m}`}>
                <rect x={20} y={20 + m * 66} width={120} height={48} rx={6} fill="var(--color-ink-900)" stroke="var(--accent)" strokeWidth={1.4} />
                <text x={80} y={42 + m * 66} textAnchor="middle" className="font-mono" fontSize={11} fontWeight={700} fill="var(--accent)">mapper {m}</text>
                <text x={80} y={56 + m * 66} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">sorts its output</text>
              </g>
            ))}
            {/* reducers */}
            {[0, 1].map((r) => (
              <g key={`r${r}`}>
                <rect x={460} y={50 + r * 90} width={140} height={50} rx={6} fill="var(--color-ink-900)" stroke="var(--accent-2)" strokeWidth={1.4} />
                <text x={530} y={72 + r * 90} textAnchor="middle" className="font-mono" fontSize={11} fontWeight={700} fill="var(--accent-2)">reducer {r}</text>
                <text x={530} y={86 + r * 90} textAnchor="middle" className="font-mono" fontSize={8} fill="var(--color-fg-faint)">merges + reduces</text>
              </g>
            ))}
            {/* shuffle lines from each mapper to each reducer */}
            {[0, 1, 2].map((m) =>
              [0, 1].map((r) => (
                <line
                  key={`l${m}-${r}`}
                  x1={140}
                  y1={44 + m * 66}
                  x2={460}
                  y2={75 + r * 90}
                  stroke="var(--color-line-strong)"
                  strokeWidth={1}
                  strokeOpacity={0.6}
                  className="flow-line"
                  style={{ strokeDasharray: "4 7" } as React.CSSProperties}
                />
              ))
            )}
            <text x={300} y={216} textAnchor="middle" className="font-mono" fontSize={9} fill="var(--color-fg-muted)">
              SHUFFLE — partition by hash(key) % R, then copy + merge-sort
            </text>
          </svg>
        </Figure>

        <Prose>
          <p>
            The trick that makes the whole thing work is the <strong>shuffle</strong>. The number of map tasks is
            set by the input — one per file block — but you choose the number of reduce tasks, <code>R</code>. To
            guarantee that every pair with the same key reaches the same reducer, the framework routes each pair to
            partition <code>hash(key) % R</code>. Each mapper sorts its own output and splits it into <code>R</code>{" "}
            partitions; as soon as a mapper finishes, the reducers fetch the partition that belongs to them and
            <strong> merge-sort</strong> the streams from all mappers together. Sorting the whole dataset at once on
            one machine is impossible, so the sort happens in stages — locally per mapper, then merged per reducer.
            This partition-sort-copy dance is the shuffle, and it is where most of a job&apos;s network traffic
            lives.
          </p>
          <p>
            Because MapReduce has <strong>no indexes</strong>, a job that needs to join two datasets can&apos;t do
            point lookups — it reads everything, like a full table scan. The standard <strong>sort-merge
            join</strong> emits the join key from <em>both</em> datasets in the map phase, so the shuffle delivers
            all records with the same key to the same reducer, sorted and ready to be matched. The rule of thumb is
            to bring a copy of the data into the same distributed filesystem rather than querying a remote database
            per record: network round-trips are slow and nondeterministic, which would wreck both throughput and
            the ability to re-run a job and get the same answer.
          </p>
        </Prose>

        <DemoFrame
          title="Drive a word-count job"
          description="You build the input — toggle log lines on or off and pick the number of reducers — then hit Run next phase to walk the job through split → map → shuffle → reduce. Inject the hot key to flood one term and watch a single reducer become the straggler that holds up the whole job."
          right="you drive it"
        >
          <WordCountLab />
        </DemoFrame>

        <DemoFrame
          title="The same job, plus the Unix equivalent"
          description="A second view of the pipeline that lines the distributed job up against the one-line Unix pipe (sort | uniq -c), and lets you kill a reducer to see why immutable inputs make retries safe — the scheduler just re-runs the dead task against the unchanged input."
          right="word-count job"
        >
          <MapReduceDemo />
        </DemoFrame>

        <Analogy>
          Imagine sorting a warehouse of mail by destination city. Each <strong>mapper</strong> is a worker who
          reads letters off one truck and pre-sorts them into bins by city. The <strong>shuffle</strong> is the
          courier run: every &quot;Berlin&quot; bin from every worker is carried to the one clerk responsible for
          Berlin. That <strong>reducer</strong> clerk merges all the Berlin piles and tallies them. No clerk ever
          touches another clerk&apos;s city, so they all work in parallel — and the hash rule guarantees every
          Berlin letter ends up at exactly one clerk.
        </Analogy>

        <Callout variant="warning" title="Skew & hot keys">
          The join breaks down when one key is wildly more popular than the rest — a celebrity with millions of
          followers, what the chapter calls a <strong>linchpin object</strong> or <strong>hot key</strong>. All its
          records hash to a single reducer, which then does far more work than the others: <strong>skew</strong>.
          The job&apos;s wall-clock is held hostage by that one straggler. Pig&apos;s <em>skewed join</em> samples
          the data to find hot keys, then spreads their records across <em>all</em> reducers (replicating the other
          side of the join). Try it below.
        </Callout>

        <DemoFrame
          title="Hot keys & the skewed join"
          description="Join an activity stream against a users table on user_id. Crank up one key's share of the traffic and watch a single reducer get crushed while the others idle. Then flip on the skewed join to spray the hot key across all reducers and flatten the load."
          right="sort-merge join"
        >
          <JoinSkewDemo />
        </DemoFrame>

        <Prose>
          <p>
            What comes out of a batch job is often not a report but a <strong>data structure</strong>: a search
            index for Lucene/Solr (Google&apos;s original use of MapReduce was building its search index), the
            features and weights of a machine-learning model, or a fresh read-only database. And here&apos;s a
            subtle but important rule about that last case: <strong>do not write to a live database
            record-by-record from inside the job.</strong> A network request per record is orders of magnitude
            slower than the job&apos;s natural throughput, concurrent mappers would hammer the database, and a
            half-finished job would leave partial results visible to everyone. The right move is to build a
            brand-new database <em>as files inside the job&apos;s output directory</em> and bulk-load it into
            read-only servers — exactly what Voldemort, ElephantDB, Terrapin and HBase bulk loading do.
          </p>
        </Prose>

        <Callout variant="insight" title="Why re-running a failed task is free">
          A MapReduce job never modifies its input and has no side effects beyond producing output. So if a task
          dies — and at Google a one-hour task had roughly a <strong>5% chance of being killed</strong> to free
          resources for higher-priority work — the scheduler just reschedules it elsewhere. It re-reads the same
          immutable input block and produces the identical output. <em>Immutability turns fault tolerance into a
          re-run.</em> This is also why MapReduce eagerly writes intermediate results to disk: durability is cheap
          insurance when terminations are routine.
        </Callout>

        <CompareTable
          caption="MapReduce vs. massively parallel processing (MPP) databases — same cluster, very different philosophies."
          columns={["MapReduce + HDFS", "MPP database"]}
          rows={[
            {
              feature: "Workload",
              values: ["Arbitrary programs — an OS-like engine for any computation over files.", <Fragment key={1}>Parallel execution of analytic <strong>SQL</strong> queries.</Fragment>],
            },
            {
              feature: "Data modeling",
              values: [<Fragment key={0}><em>Schema-on-read</em>: dump raw data into HDFS; the consumer interprets it.</Fragment>, "Careful up-front modeling into a proprietary columnar format before load."],
            },
            {
              feature: "On node failure",
              values: ["Tolerates it — only the failed task re-runs; the job continues.", <Fragment key={1}>Typically <strong>aborts the whole query</strong> and restarts it.</Fragment>],
            },
            {
              feature: "Memory vs disk",
              values: ["Eagerly writes to disk; assumes data may exceed memory.", "Prefers to keep as much as possible in memory for speed."],
            },
            {
              feature: "Best fit",
              values: ["Very large, long-running jobs on unreliable, multi-tenant clusters.", "Fast interactive analytics on carefully curated data."],
            },
          ]}
        />

        <RealWorld
          examples={[
            { system: "HDFS", detail: <>The open-source distributed filesystem (NameNode + DataNodes) modeled on the Google File System; the storage layer beneath Hadoop MapReduce.</> },
            { system: "Hadoop MapReduce", detail: <>The classic implementation where mapper and reducer are Java classes; still a solid way to build Lucene/Solr search indexes offline.</> },
            { system: "Pig / Hive / Cascading / Crunch", detail: <>Higher-level languages compiled down to MapReduce jobs, so you describe joins and groupings instead of hand-coding mappers.</> },
            { system: "Voldemort / ElephantDB / HBase", detail: <>Key-value stores that ingest immutable DB files built inside a batch job — the &quot;build files, then bulk-load&quot; output pattern.</> },
          ]}
        />
      </Section>

      {/* ------------------------------------------------------ Beyond MR */}
      <Section
        id="beyond"
        kicker="Beyond MapReduce"
        title="Dataflow engines, lineage & graphs"
        intro={
          <>
            MapReduce is famously robust but not famously fast. Its habit of writing every intermediate result to a
            replicated filesystem — and forcing each job to finish before the next can start — leaves a lot of
            performance on the table. The next generation keeps the fault tolerance while pipelining the work.
          </>
        }
      >
        <Prose>
          <p>
            In a multi-stage workflow, the files MapReduce writes between jobs are just <em>intermediate
            state</em> — a way to pass data from one job to the next. The act of writing that state out fully is
            called <strong>materialization</strong>, and it has three costs compared with a Unix pipe. First, a job
            can only start once <em>every</em> task in the preceding job has finished, so stages run strictly
            serially (a Unix pipe, by contrast, starts all stages at once and streams between them). Second,
            mappers are often redundant — they just re-read a file a reducer wrote moments earlier. Third, that
            intermediate data gets replicated across several nodes, which is overkill for something so temporary.
          </p>
          <p>
            <strong>Dataflow engines</strong> — Spark, Tez, and Flink — fix this by handling a whole workflow as a
            single job built from flexible <strong>operators</strong>, rather than chopping it into rigid,
            alternating map and reduce stages. They stream records between operators in memory and avoid the
            needless HDFS round-trips. But skipping materialization raises a question: if intermediate state lives
            only in memory and isn&apos;t replicated, how do you survive a node failure? The answer is{" "}
            <strong>recompute it</strong>. The engine tracks how each piece of data was derived — Spark uses the{" "}
            <em>resilient distributed dataset</em> (RDD) to record ancestry, while Flink <em>checkpoints</em>{" "}
            operator state — so a lost partition can be rebuilt from its inputs instead of read back from a durable
            file.
          </p>
        </Prose>

        <DemoFrame
          title="Materialize vs. pipeline"
          description="Run the same A → B → C workflow on each engine, then inject a node fault at stage B. MapReduce materializes every stage to HDFS (replicated 3×) and recovers by re-reading the durable file; a dataflow engine pipelines operators in memory and recovers by recomputing the lost partition from lineage."
          right="A → B → C"
        >
          <DataflowDemo />
        </DemoFrame>

        <Analogy>
          MapReduce is a <strong>relay race where each runner must fully stop, hand the baton to a judge who
          photocopies it three times, and only then may the next runner start.</strong> Safe, auditable, slow. A
          dataflow engine is a <strong>bucket brigade</strong>: everyone passes water at once, hand to hand. If
          someone drops out, you don&apos;t consult a filing cabinet — you just refill that one bucket from the
          person upstream and keep going.
        </Analogy>

        <Callout variant="tradeoff">
          Recomputation is cheaper than replication <em>only if recomputing is fast and deterministic</em>. If an
          operator is expensive or its inputs have since been deleted, re-deriving a lost partition can cost more
          than just having written it to disk. That&apos;s why these engines let you <strong>checkpoint or
          persist</strong> chosen intermediate results — a deliberate dial between MapReduce&apos;s
          write-everything safety and pure in-memory speed.
        </Callout>

        <Prose>
          <p>
            One workload resists the plain MapReduce model entirely: <strong>iterative graph algorithms</strong>{" "}
            like PageRank or recommendation ranking, which must &quot;repeat until done.&quot; MapReduce runs a
            single pass over its input, so iterating requires clumsy external orchestration that re-reads the whole
            graph each round. The fix is the <strong>bulk synchronous parallel (BSP)</strong> model — popularized by
            Google&apos;s <em>Pregel</em> paper and implemented by Apache Giraph, Spark&apos;s GraphX, and
            Flink&apos;s Gelly. In Pregel, computation is organized around <em>vertices</em>: in each iteration a
            vertex can send messages to other vertices (usually along its edges), and — crucially — a vertex{" "}
            <strong>remembers its state in memory from one iteration to the next</strong>. Because vertices
            communicate only by message passing, the framework can <em>batch</em> messages for efficiency, and it
            achieves fault tolerance by periodically checkpointing every vertex&apos;s state at the end of an
            iteration.
          </p>
        </Prose>

        <Callout variant="note" title="When NOT to go distributed">
          Graph algorithms generate heavy cross-machine chatter, and the intermediate state is often bigger than
          the original graph. So if your graph fits in memory on a single machine, a plain single-machine algorithm
          will very likely <strong>beat</strong> a distributed Pregel job. Reach for distribution only when the
          graph genuinely won&apos;t fit on one box — distribution is a cost you pay for scale, not a free upgrade.
        </Callout>

        <DefinitionGrid
          items={[
            { term: "Materialization", def: <>Writing a stage&apos;s full output to a filesystem before the next stage starts. Durable and simple, but serial and disk-heavy.</> },
            { term: "Dataflow engine", def: <>Spark / Tez / Flink — runs a whole workflow as one job of pipelined operators, avoiding redundant HDFS writes.</> },
            { term: "Lineage (RDD)", def: <>A record of how data was computed. Spark rebuilds a lost partition by re-running its ancestry instead of reading a replica.</> },
            { term: "Pregel / BSP", def: <>An iterative graph model: stateful vertices exchange batched messages each superstep; state is checkpointed for fault tolerance.</> },
          ]}
        />

        <RealWorld
          examples={[
            { system: "Apache Spark", detail: <>RDDs and lineage-based recovery; runs SQL, ML and graph workloads as one optimized DAG of operators in memory.</> },
            { system: "Apache Flink", detail: <>Operator state with periodic checkpoints, recovering a failed operator without re-running the whole job.</> },
            { system: "Apache Tez", detail: <>A lower-level dataflow engine that Hive and Pig can target instead of classic MapReduce for big latency wins.</> },
            { system: "Giraph / GraphX / Gelly", detail: <>Pregel-style bulk-synchronous-parallel graph processing on top of Hadoop, Spark, and Flink respectively.</> },
          ]}
        />
      </Section>

      {/* --------------------------------------------------- in production */}
      <Section
        id="in-production"
        kicker="In Production"
        title="These ideas, running at scale"
        intro={
          <>
            The chapter isn&apos;t a museum tour — every one of these engines runs in anger today, moving petabytes.
            Here is where the abstractions in this chapter show up in real, named systems, with the numbers their
            own engineers published.
          </>
        }
      >
        <RealWorld
          examples={[
            {
              system: "Google — MapReduce (the origin)",
              detail: (
                <>
                  The 2004 paper reports that within a few years Google was running on the order of{" "}
                  <strong>100,000 MapReduce jobs a day</strong>, processing <strong>20+ PB daily</strong> — building
                  the web search index, among much else. This is the workload that proved &quot;move compute to the
                  data, sort, reduce&quot; could scale to a planet.
                </>
              ),
            },
            {
              system: "Meta — a single 60 TB Spark job",
              detail: (
                <>
                  Facebook&apos;s engineering team replaced a chain of Hive jobs with <strong>one Spark job</strong>{" "}
                  that reads <strong>60 TB</strong> of compressed input and performs a <strong>~90 TB shuffle</strong> —
                  the dataflow-engine model (pipelined operators, lineage-based recovery) from the last section, taken
                  to production scale. It took real work hardening Spark&apos;s shuffle and memory handling to get
                  there.
                </>
              ),
            },
            {
              system: "Google — Pregel powers PageRank",
              detail: (
                <>
                  Iterative graph ranking over the web graph (billions of vertices, trillions of edges) is exactly the
                  &quot;repeat until done&quot; workload plain MapReduce handles badly. Google&apos;s{" "}
                  <strong>Pregel</strong> (the bulk-synchronous-parallel model) was built for it; Apache Giraph,
                  Spark&apos;s GraphX, and Flink&apos;s Gelly are its open-source descendants.
                </>
              ),
            },
            {
              system: "Hadoop ecosystem — Hive on Tez",
              detail: (
                <>
                  Petabyte-scale data warehouses (e.g. at Facebook and Yahoo) run SQL through Hive, which compiles to
                  a dataflow DAG on <strong>Tez</strong> rather than rigid map/reduce stages — the &quot;higher-level
                  language over a dataflow engine&quot; pattern this chapter ends on.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/* --------------------------------------------------- watch & read */}
      <Section
        id="watch"
        kicker="See it explained"
        title="A five-minute mental model"
        intro={
          <>
            If the map → shuffle → reduce dance still feels abstract, this short walk-through builds the same
            word-count example you just drove above — useful to watch before or after playing with the simulator.
          </>
        }
      >
        <YouTubeEmbed
          videoId="cHGaQz0E7AU"
          title="Map Reduce explained with example — System Design"
        />
        <Prose>
          <p>
            Notice how the video lands on the same two pillars as this chapter: the framework{" "}
            <strong>parallelises map and reduce for you</strong>, and it stays <strong>fault-tolerant</strong> because
            a failed worker&apos;s task is simply rescheduled — the immutable-input idea you saw make retries free.
          </p>
        </Prose>

        <FurtherReading
          title="Go to the source"
          sources={[
            {
              title: "MapReduce: Simplified Data Processing on Large Clusters (Dean & Ghemawat, OSDI 2004)",
              url: "https://research.google.com/archive/mapreduce-osdi04.pdf",
              note: "The original paper. Surprisingly readable — read §2–3 for the programming model and §3.1 for fault tolerance.",
            },
            {
              title: "The Google File System (Ghemawat, Gobioff & Leung, SOSP 2003)",
              url: "https://research.google.com/archive/gfs-sosp2003.pdf",
              note: "The distributed filesystem HDFS was modeled on: a single master, chunkservers, replicated blocks on commodity disks.",
            },
            {
              title: "Resilient Distributed Datasets (Zaharia et al., NSDI 2012)",
              url: "https://www.usenix.org/system/files/conference/nsdi12/nsdi12-final138.pdf",
              note: "Best-paper award. Defines the RDD and lineage-based recovery that powers Spark's in-memory dataflow.",
            },
            {
              title: "Apache Spark — RDD Programming Guide",
              url: "https://spark.apache.org/docs/latest/rdd-programming-guide.html",
              note: "The hands-on docs for transformations, actions, and how a lost partition is recomputed from its lineage.",
            },
            {
              title: "Pregel: A System for Large-Scale Graph Processing (Malewicz et al., SIGMOD 2010)",
              url: "https://kowshik.github.io/JPregel/pregel_paper.pdf",
              note: "The vertex-centric, bulk-synchronous-parallel model behind Giraph, GraphX and Gelly.",
            },
            {
              title: "Apache Spark @Scale: a 60 TB+ production use case (Meta Engineering)",
              url: "https://engineering.fb.com/2016/08/31/core-infra/apache-spark-scale-a-60-tb-production-use-case/",
              note: "Field report on replacing a Hive pipeline with one giant Spark job — and what broke at 90 TB of shuffle.",
            },
          ]}
        />
      </Section>

      {/* ----------------------------------------------------------- practice */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            Generate a fresh set of questions on batch processing — pick a difficulty, answer, and hit{" "}
            <em>discuss</em> on anything you want to dig into. The tutor below is grounded in this exact chapter.
          </p>
        </Prose>
        <Quiz chapterTitle="Batch Processing" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Batch Processing" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Batch processing crunches a bounded dataset offline; throughput, not latency, is the goal — distinct from online services and stream processing.",
          "The Unix philosophy — small tools, a uniform byte-stream interface, stdin/stdout, no side effects — composes simple programs into powerful pipelines, and scales conceptually all the way up.",
          "MapReduce is that philosophy on a cluster: map() emits (key, value), the framework sorts, and reduce() aggregates — with the shuffle (partition by hash, sort, copy) doing the heavy lifting over a shared-nothing filesystem like HDFS.",
          "Joins are full scans (sort-merge), not index lookups; hot keys cause skew, which a skewed join fixes by spreading a hot key's records across all reducers.",
          "Immutable inputs and side-effect-free jobs are the superpower: a failed task simply re-runs and produces the identical output, making large-scale fault tolerance almost free.",
          "Dataflow engines (Spark, Flink, Tez) keep that fault tolerance but pipeline operators in memory, recovering lost state by recomputing from lineage rather than re-reading replicated files.",
          "Iterative graph work needs the Pregel / bulk-synchronous-parallel model — but if the graph fits in memory, a single machine usually wins.",
        ]}
      />
    </ChapterShell>
  );
}
