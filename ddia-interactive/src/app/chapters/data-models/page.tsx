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
  CompareTable,
  DefinitionGrid,
  CodeBlock,
  Figure,
  Quiz,
  AskClaude,
  YouTubeEmbed,
  FurtherReading,
} from "@/components/chapter";
import { Hero } from "./Hero";
import { ModelExplorer } from "./ModelExplorer";
import { QueryDuel } from "./QueryDuel";
import { GraphTraversal } from "./GraphTraversal";
import { QueryRunner } from "./QueryRunner";

export const metadata: Metadata = {
  title: "Data Models & Query Languages",
  description:
    "Relational, document, and graph data models — the object–relational impedance mismatch, schema-on-read, declarative vs imperative queries, and how to pick a model from your access patterns.",
};

const CONCEPTS = `Applications layer one data model on top of another; each layer hides the
complexity below behind a cleaner interface. The relational model (Codd) lays data
out as relations (tables) of tuples (rows); a query optimizer chooses the access path
and indexes, so you state WHAT not HOW. NoSQL ("Not Only SQL") arose from desires for
scalability, open-source tooling, specialized queries, and more dynamic/expressive
models. The object–relational impedance mismatch is the awkward translation layer
("shredding") between nested application objects and flat relational tables; ORMs
reduce but don't remove it. The document model (JSON, e.g. MongoDB) stores a record as
one self-contained tree, giving storage LOCALITY — one read loads the whole record —
and schema flexibility. It handles one-to-many tree structures well but has weak join
support, so many-to-many relationships force either duplication or application-side
joins (multiple queries). History: IBM's IMS used a hierarchical model (one parent per
record, no joins); the CODASYL network model allowed multiple parents but forced manual
cursor traversal along a fixed "access path." The relational model won by hiding access
paths. Document DBs are SCHEMA-ON-READ (implicit, interpreted at read = dynamic typing)
vs relational SCHEMA-ON-WRITE (explicit, enforced on write = static typing). Choose
document for document-like/tree data; choose relational for rich many-to-many and joins.
Document and relational databases are CONVERGING (Postgres has JSONB; some document DBs
add joins). Query languages: SQL is DECLARATIVE (state the pattern; optimizer picks the
plan, enables parallelism and index changes without query rewrites) vs IMPERATIVE (you
code the loop/order; hard to parallelize). CSS/relational algebra are declarative wins.
MapReduce is a low-level model with pure map/reduce functions (no side effects, runnable
anywhere/reorderable); MongoDB later added the declarative aggregation pipeline. Graph
models suit pervasive many-to-many data: vertices/nodes/entities + edges/relationships/
arcs. Property graphs (Neo4j) give each vertex an id, in/out edges, and properties; each
edge has a tail and head vertex, a label, and properties — great for evolvability.
Triple-stores store (subject, predicate, object) facts; RDF + SPARQL query them. Datalog
writes predicate(subject, object) and defines reusable, composable RULES. Cypher is
Neo4j's declarative language; variable-length paths like :WITHIN*0.. follow an edge
zero-or-more times — expressible in SQL via WITH RECURSIVE CTEs. In a graph query the
number of joins is not fixed in advance; it is data-dependent.`;

export default function Page() {
  return (
    <ChapterShell slug="data-models" diagram={<Hero />}>
      {/* ============================================================ Intro */}
      <Section
        id="intro"
        kicker="The big idea"
        title="A data model is a lens, not a law"
        intro="The same facts can be shaped as tables, a document, or a graph. The 'right' shape is the one that matches how your application asks questions."
      >
        <Prose>
          <p>
            Almost every application is built as a stack of data models. You think in objects and
            data structures; those map to JSON or rows; those map to bytes on disk; those map to
            electrical signals. <strong>Each layer hides the messiness of the one beneath it</strong> behind a
            cleaner interface, which is exactly what lets a product team, a DBA, and a hardware
            engineer all work on the same system without stepping on each other.
          </p>
          <p>
            This chapter is about the layer where most design decisions actually bite: the{" "}
            <em>logical</em> data model your application speaks. There are three great families —{" "}
            <strong>relational</strong>, <strong>document</strong>, and <strong>graph</strong> — and the
            entire chapter is one argument: which one fits depends on the <em>relationships</em> in your
            data and the <em>access patterns</em> of your queries, not on fashion.
          </p>
        </Prose>
        <Callout variant="insight">
          The whole chapter rests on one distinction: <strong>one-to-many</strong> relationships are trees
          (documents love them), while <strong>many-to-many</strong> relationships are graphs (the
          relational and graph models handle them; documents struggle). Find the many-to-many edges in
          your domain and the model usually chooses itself.
        </Callout>
      </Section>

      {/* ================================================ Relational vs Document */}
      <Section
        id="relational-vs-document"
        kicker="Relational vs Document"
        title="Relational vs Document"
        intro="Tables and foreign keys vs self-contained JSON trees — a trade between joins and locality."
      >
        <Prose>
          <p>
            The relational model was Edgar Codd&apos;s 1970 answer to a mess. Its roots are in{" "}
            <em>business data processing</em> — transaction processing and batch processing — and its
            radical move was to <strong>lay all the data out in the open</strong>: a relation (table) is
            just a set of tuples (rows), with no hidden navigation structure. You describe the result you
            want and a <strong>query optimizer</strong> decides which indexes to use and in what order to
            join — it picks the <em>access path</em> for you.
          </p>
          <p>
            The document model takes the opposite tack. A record — a résumé, an order, a tweet — is stored
            as <strong>one self-contained JSON tree</strong>. Because related data sits together, you get{" "}
            <strong>storage locality</strong>: a single read loads the whole thing, no joins required. This
            shines when your data really is tree-shaped and you usually need the whole tree at once.
          </p>
          <p>
            The friction the document model is trying to relieve is the{" "}
            <strong>object–relational impedance mismatch</strong>: your code holds a nested object, but a
            normalized relational schema holds flat tuples across several tables, so a translation layer must{" "}
            <em>shred</em> the object into rows on write and <em>re-stitch</em> rows into the object on read.
            JSON makes that mismatch largely disappear — for tree-shaped data.
          </p>
          <p>
            But the document model&apos;s weakness is the relational model&apos;s strength.{" "}
            <strong>Joins are weak or absent in document databases.</strong> The moment your data has{" "}
            <strong>many-to-many</strong> relationships — a skill shared by many people, an actor in many
            films — you must either <strong>duplicate</strong> data into each document (and fight update
            anomalies) or <strong>emulate joins in application code</strong> with multiple round-trips. The
            relational model answers many-to-many natively with a junction table and a join.
          </p>
        </Prose>

        <Analogy title="Analogy — IKEA flat-pack vs a finished chair">
          A <strong>document</strong> is a finished chair: assembled, one piece, grab it and sit — but if
          ten chairs share the same kind of leg and that leg is redesigned, you must rebuild every chair. A{" "}
          <strong>normalized relational schema</strong> is the flat-pack: legs, seat, and screws stored once
          in separate bins (tables); you assemble on demand with a <em>join</em>. Redesign the leg once and
          every chair benefits — at the cost of assembling every time you want to sit.
        </Analogy>

        <DemoFrame
          title="One entity, three models — the explorer"
          description="Here is a single person record rendered as normalized tables, one JSON document, and a property graph. Flip 'skills' from a private list (one-to-many) to a shared, endorsable entity (many-to-many) and watch a join table appear, the document start duplicating labels, and the graph just add edges. The live counters tally joins, duplicated facts, and the impedance-mismatch shredding."
          right="same data · three shapes"
        >
          <ModelExplorer />
        </DemoFrame>

        <Callout variant="tradeoff" title="Locality vs joins">
          Locality is double-edged. The database typically loads (and rewrites) the <em>entire</em> document
          even when you touch one field — so large documents are costly, and Kleppmann&apos;s advice is to{" "}
          <strong>keep documents small</strong>. You trade cheap whole-record reads for expensive partial
          updates and weak cross-document querying.
        </Callout>

        <Prose>
          <p>
            None of this is new. The dominant 1970s database, IBM&apos;s <strong>IMS</strong>, used a{" "}
            <em>hierarchical model</em> — like documents, it nailed one-to-many trees and stumbled on
            many-to-many. The <strong>CODASYL network model</strong> generalized it so a record could have
            multiple parents, but you navigated by <strong>manually moving a cursor along a fixed access
            path</strong>; if you lacked a path to the data you wanted, you were stuck, and changing the
            model was painful. The relational model&apos;s win was precisely to <strong>delete the concept
            of a hand-coded access path</strong> and let the optimizer find one. Today the families are{" "}
            <strong>converging</strong>: PostgreSQL stores and indexes JSON (JSONB), and several document
            stores have added joins.
          </p>
        </Prose>

        <CompareTable
          caption="There is no universal winner — match the model to the shape of your data and queries."
          columns={["Relational", "Document"]}
          rows={[
            {
              feature: "Best fit",
              values: [
                "Many-to-one & many-to-many; rich cross-entity queries",
                "Tree-shaped records read & written whole",
              ],
            },
            {
              feature: "Joins",
              values: ["First-class; optimizer-planned", "Weak/absent — emulate in app code"],
            },
            {
              feature: "Schema",
              values: [
                "Schema-on-write (enforced, static-typing-like)",
                "Schema-on-read (implicit, dynamic-typing-like)",
              ],
            },
            {
              feature: "Locality",
              values: ["Data spread across tables", "One read loads the whole record"],
            },
            {
              feature: "Failure mode",
              values: ["Shredding/impedance mismatch; many tables", "Duplication, update anomalies, drift"],
            },
          ]}
        />

        <DefinitionGrid
          items={[
            {
              term: "Impedance mismatch",
              def: <>The awkward translation between nested application objects and flat relational tuples.</>,
            },
            {
              term: "Locality",
              def: <>Keeping data that is read together physically together, so one read suffices.</>,
            },
            {
              term: "Normalization",
              def: <>Storing each fact once and referencing it by ID, so updates touch one place.</>,
            },
            {
              term: "Shredding",
              def: <>Decomposing one object into rows across multiple tables on write.</>,
            },
          ]}
        />

        <RealWorld
          examples={[
            {
              system: "PostgreSQL",
              detail: (
                <>
                  Relational at heart, but <code>jsonb</code> columns with GIN indexes let it store and query
                  documents — the convergence in one engine.
                </>
              ),
            },
            {
              system: "MongoDB",
              detail: (
                <>
                  The canonical document store: BSON trees, schema-on-read. Many-to-many is modeled with
                  references resolved by extra queries or <code>$lookup</code>.
                </>
              ),
            },
            {
              system: "IBM IMS",
              detail: <>1968 hierarchical database still running mainframe workloads — the original document-like model.</>,
            },
            {
              system: "Espresso (LinkedIn)",
              detail: <>Document store backing the very many-to-many social graph that pushed LinkedIn toward graph tooling too.</>,
            },
          ]}
        />

        <Callout variant="warning" title="Schema-on-read is not 'no schema'">
          A schemaless document still has a schema — it just lives in your application code and is{" "}
          <strong>not enforced</strong> by the database. On read, clients have <em>no guarantee</em> which
          fields exist. That flexibility is genuinely useful for heterogeneous data or data shaped by external
          systems, but it moves validation and migration burden into your code, where it is easy to forget.
        </Callout>
      </Section>

      {/* ================================================== Query Languages */}
      <Section
        id="query-languages"
        kicker="Query Languages"
        title="Declarative vs Imperative Queries"
        intro="Say what you want, or say how to get it — and discover why 'what' usually wins."
      >
        <Prose>
          <p>
            SQL is a <strong>declarative</strong> language: you specify the <em>pattern</em> of the data you
            want — <code>WHERE family = &apos;Sharks&apos;</code> — and stay silent on <em>how</em> to find
            it. An <strong>imperative</strong> program does the opposite: it issues operations in a specific
            order — open a cursor, loop, test each row, append. The CODASYL cursor-walk was imperative to the
            bone.
          </p>
          <p>
            Why does declarative usually win? Because <strong>it hides the execution strategy</strong>. Since
            you never named an algorithm, the engine&apos;s optimizer is free to reorder work, swap in a new
            index, or — crucially — <strong>run pieces in parallel across cores and machines</strong>.
            Imperative code pins down an order, and order is the enemy of parallelism: the engine can&apos;t
            safely reorder steps you explicitly sequenced. Declarative queries also survive change — add an
            index and every query speeds up with <em>zero</em> rewrites.
          </p>
          <p>
            The same lesson shows up on the web: declarative <strong>CSS</strong> selectors beat hand-written
            imperative DOM-styling in JavaScript for exactly the same reasons — the browser optimizes the{" "}
            <em>how</em>.
          </p>
        </Prose>

        <DemoFrame
          title="Declarative vs imperative — watch the optimizer earn its keep"
          description="The task: find every shark in a set of sightings. In imperative mode you wrote the loop, so a single cursor must march through all eight rows in order — eight serial ticks. In declarative mode you only stated the predicate, so the optimizer fans out across four shards at once and finishes in two. Hit Run in each mode and compare the wall-clock ticks and parallelism."
          right="optimizer vs cursor"
        >
          <QueryDuel />
        </DemoFrame>

        <Callout variant="insight" title="Why parallelism follows from 'what, not how'">
          A declarative query describes only the <em>result pattern</em>, so the engine can split the work any
          way it likes. Imperative code &quot;visit row 1, then 2, then 3…&quot; forbids that — the
          dependency on order is baked in. This is the deep reason MapReduce, columnar engines, and SQL
          warehouses can scale a single query across thousands of cores.
        </Callout>

        <Prose>
          <p>
            <strong>MapReduce</strong> sits in between. It&apos;s a programming model for crunching huge
            datasets across many machines using two functions you supply — <code>map</code> and{" "}
            <code>reduce</code> — which must be <strong>pure</strong>: no side effects, no extra database
            queries. Purity is what lets the framework run them anywhere, in any order, and safely re-run them
            after a failure. The cost is usability: you must hand-code two carefully coordinated functions.
            MongoDB shipped a MapReduce API and then, recognizing that pain, added the declarative{" "}
            <strong>aggregation pipeline</strong> — which gives the optimizer back its room to maneuver.
          </p>
        </Prose>

        <CodeBlock
          lang="javascript"
          caption="MongoDB MapReduce: powerful, but you write two coordinated pure functions by hand."
          code={`db.observations.mapReduce(
  function map() {
    var year  = this.observationTimestamp.getFullYear();
    var month = this.observationTimestamp.getMonth() + 1;
    emit(year + "-" + month, this.numAnimals);   // group key, value
  },
  function reduce(key, values) {
    return Array.sum(values);                     // must be pure
  },
  { query: { family: "Sharks" }, out: "monthlySharkReport" }
);`}
        />
        <CodeBlock
          lang="javascript"
          caption="The same computation as a declarative aggregation pipeline — the optimizer plans it."
          code={`db.observations.aggregate([
  { $match: { family: "Sharks" } },
  { $group: {
      _id: { year:  { $year:  "$observationTimestamp" },
             month: { $month: "$observationTimestamp" } },
      totalAnimals: { $sum: "$numAnimals" }
  } }
]);`}
        />

        <Analogy title="Analogy — taxi vs turn-by-turn">
          A <strong>declarative</strong> query is telling a cab driver &quot;take me to the airport&quot; — you
          state the destination and let them pick the route, dodge traffic, take a new shortcut.{" "}
          <strong>Imperative</strong> querying is dictating &quot;left, left, straight, right…&quot; — if a
          road closes or a faster route opens, you get none of it, because you specified the path instead of
          the goal.
        </Analogy>

        <RealWorld
          examples={[
            {
              system: "PostgreSQL planner",
              detail: <>Cost-based optimizer reorders joins and chooses indexes; <code>EXPLAIN</code> shows the plan it picked.</>,
            },
            {
              system: "MapReduce / Hadoop",
              detail: <>Pure map/reduce functions run in parallel across a cluster and re-run on node failure.</>,
            },
            {
              system: "MongoDB aggregation",
              detail: <>Declarative pipeline added in 2.2 to replace hand-written MapReduce for most jobs.</>,
            },
            {
              system: "CSS &amp; XSL",
              detail: <>Declarative styling/transforms the browser optimizes — far better than imperative DOM mutation.</>,
            },
          ]}
        />
      </Section>

      {/* ==================================================== Graph Models */}
      <Section
        id="graph-models"
        kicker="Graph-Like Models"
        title="Graph-Like Data Models"
        intro="When many-to-many is everywhere, stop fighting it — make relationships first-class."
      >
        <Prose>
          <p>
            If many-to-many relationships dominate your data, it becomes natural to model it as a{" "}
            <strong>graph</strong>: a set of <strong>vertices</strong> (nodes, entities) connected by{" "}
            <strong>edges</strong> (relationships, arcs). Social networks, road maps, the web&apos;s link
            structure, and recommendation systems are all graphs, and decades of algorithms — shortest path,
            PageRank — operate on them directly.
          </p>
          <p>
            In the <strong>property graph</strong> model (Neo4j, JanusGraph/Titan), every <em>vertex</em> has
            a unique id, a set of outgoing and incoming edges, and a bag of key–value properties. Every{" "}
            <em>edge</em> has an id, a <strong>tail</strong> vertex (where it starts), a <strong>head</strong>{" "}
            vertex (where it ends), a <strong>label</strong> naming the relationship, and its own properties.
            That uniformity is what makes graphs superb for <strong>evolvability</strong>: bolt on a new kind
            of relationship by adding edges with a new label — no schema migration, no table to alter.
          </p>
          <p>
            The killer feature for queries is the <strong>variable-length traversal</strong>. In a relational
            query you must know your joins up front. In a graph, the number of hops is{" "}
            <strong>data-dependent</strong>. Cypher (Neo4j&apos;s declarative language) writes{" "}
            <code>:WITHIN*0..</code> to mean &quot;follow a <code>WITHIN</code> edge zero or more times&quot; —
            the <code>*</code> works like in a regular expression. SQL can express the same idea, but only with
            the heavier <strong>recursive common table expression</strong> (<code>WITH RECURSIVE</code>).
          </p>
        </Prose>

        <DemoFrame
          title="Variable-length traversal — joins you didn't have to count"
          description="A location hierarchy linked by WITHIN edges, with people linked in by BORN_IN and LIVES_IN. Drag 'max hops' (the *0..N in Cypher) and watch the reachable set grow outward from Lucy — city, region, country, continent. Each hop is one more self-join the engine runs, but you never wrote them. Flip the toggle to see the same query as a recursive SQL CTE."
          right="Cypher *0..N"
        >
          <GraphTraversal />
        </DemoFrame>

        <Prose>
          <p>
            The cleanest way to feel the difference is to run the <em>same</em> query against the{" "}
            <em>same</em> data in all three models and count the work. A many-to-many query like{" "}
            <strong>friends-of-friends</strong> is the canonical test: it is a single edge-walk in a graph,
            a repeated self-join in SQL, and — because document stores have no server-side join — an{" "}
            <strong>N+1 fan-out of round-trips</strong> in a document store.
          </p>
        </Prose>

        <DemoFrame
          title="Run the query — one dataset, three engines"
          description="Six people, six friendships — stored once as relational tables, JSON documents, and a property graph. Pick a query (friends, friends-of-friends, or mutual friends) and a model, then step the engine and watch it work: SQL self-joins the friendships table, the document store fires a round-trip per friend (the N+1 problem, since it can't join), and the graph just hops edge-to-edge. The counters tally joins vs round-trips vs hops so you can see why deeply-linked many-to-many data favours the graph."
          right="joins vs round-trips vs hops"
        >
          <QueryRunner />
        </DemoFrame>

        <Figure caption="Same fact, three encodings: a property-graph edge, an RDF triple, and a Datalog predicate.">
          <div className="grid gap-3 font-mono text-[12px] sm:grid-cols-3">
            <div className="rounded-md border border-line bg-ink-950 p-3">
              <div className="kicker mb-2 text-[9px]">Property graph</div>
              <div className="text-fg-muted">
                (<span className="accent-text">jim</span>) -[:<span className="text-special">LIKES</span>]-&gt; (
                <span className="text-accent-2">bananas</span>)
              </div>
            </div>
            <div className="rounded-md border border-line bg-ink-950 p-3">
              <div className="kicker mb-2 text-[9px]">RDF triple</div>
              <div className="text-fg-muted">
                <span className="accent-text">jim</span> <span className="text-special">likes</span>{" "}
                <span className="text-accent-2">bananas</span> .
              </div>
            </div>
            <div className="rounded-md border border-line bg-ink-950 p-3">
              <div className="kicker mb-2 text-[9px]">Datalog</div>
              <div className="text-fg-muted">
                <span className="text-special">likes</span>(<span className="accent-text">jim</span>,{" "}
                <span className="text-accent-2">bananas</span>).
              </div>
            </div>
          </div>
        </Figure>

        <Prose>
          <p>
            There&apos;s a second style: the <strong>triple-store</strong>. Here all information is reduced to
            dead-simple three-part statements — <strong>(subject, predicate, object)</strong>, e.g.{" "}
            <em>(Jim, likes, bananas)</em>. A triple is equivalent to a vertex-plus-edge in a graph.{" "}
            <strong>RDF</strong> is the standard triple data model and <strong>SPARQL</strong> its query
            language. Underneath them sits <strong>Datalog</strong>, the foundation later languages build on:
            it writes a triple as <code>predicate(subject, object)</code> and lets you define{" "}
            <strong>rules</strong> — named predicates derived from others, which can call each other and
            recurse, just like functions. Rules are <em>composable and reusable</em>: clumsy for a quick
            one-off query, but powerful when the data and its relationships get complex.
          </p>
        </Prose>

        <Analogy title="Analogy — six degrees of separation">
          Asking &quot;how is Lucy connected to this person?&quot; in a relational schema means guessing the
          number of <code>JOIN</code>s in advance — but you don&apos;t know if the answer is two hops or six. A
          graph just says &quot;follow <code>KNOWS</code> edges until you arrive,&quot; letting the{" "}
          <em>data</em> decide the depth. That is the difference between a fixed-length and a variable-length
          path.
        </Analogy>

        <CompareTable
          caption="Three graph styles and their declarative query languages — all model many-to-many natively."
          columns={["Property graph", "Triple-store / RDF", "Datalog"]}
          rows={[
            {
              feature: "Unit of data",
              values: ["Vertices + labelled edges, both with properties", "(subject, predicate, object) triples", "predicate(subject, object) facts + rules"],
            },
            {
              feature: "Query language",
              values: ["Cypher", "SPARQL", "Datalog"],
            },
            {
              feature: "Engines",
              values: ["Neo4j, JanusGraph", "Datomic, AllegroGraph", "Datomic, research/academic systems"],
            },
            {
              feature: "Sweet spot",
              values: ["Rich, evolving relationships", "Interop & linked open data", "Reusable recursive rules over complex data"],
            },
          ]}
        />

        <CodeBlock
          lang="cypher"
          caption="Cypher: variable-length traversal in three lines. The number of WITHIN hops is not fixed in advance."
          code={`MATCH (person) -[:BORN_IN]-> () -[:WITHIN*0..]-> (us:Location {name:'United States'}),
      (person) -[:LIVES_IN]-> () -[:WITHIN*0..]-> (eu:Location {name:'Europe'})
RETURN person.name`}
        />

        <RealWorld
          examples={[
            {
              system: "Neo4j",
              detail: <>The reference property-graph database; created Cypher and the openCypher standard.</>,
            },
            {
              system: "Datomic",
              detail: <>Triple/fact-oriented store queried with a Datalog dialect; immutable, time-aware facts.</>,
            },
            {
              system: "RDF + SPARQL",
              detail: <>W3C standards behind Wikidata and the linked-open-data web of (subject, predicate, object) facts.</>,
            },
            {
              system: "Facebook TAO",
              detail: (
                <>
                  Facebook&apos;s planet-scale social-graph store: <em>objects</em> are typed vertices keyed by
                  a 64-bit id; <em>associations</em> are typed, directed edges <code>(id1, type, id2)</code>.
                  Read-optimized, serving billions of edge queries per second.
                </>
              ),
            },
          ]}
        />

        <Callout variant="note" title="Relational can do graphs — awkwardly">
          You <em>can</em> traverse a graph in SQL using <code>WITH RECURSIVE</code> CTEs, and for shallow,
          fixed traversals that&apos;s fine. But once paths are long, branchy, or of unknown length, the
          recursive SQL grows hard to write and reason about — which is exactly the niche purpose-built graph
          databases and Cypher fill.
        </Callout>
      </Section>

      {/* ============================================== See it explained */}
      <Section
        id="watch"
        kicker="See it explained"
        title="Watch the models compared"
        intro="Two short explainers that pin down the same relational vs document vs graph trade-offs from a different angle."
      >
        <Prose>
          <p>
            If you want the ideas in motion, these two videos cover the territory of this chapter — the first
            stages a head-to-head between the three model families, the second drills into the deeper SQL vs
            NoSQL split that the relational/document divide sits inside.
          </p>
        </Prose>
        <YouTubeEmbed
          videoId="FrS9KPdUV2E"
          title="Database Showdown: Relational vs. Document vs. Graph"
        />
        <YouTubeEmbed videoId="Q5aTUc7c4jg" title="SQL vs. NoSQL: What's the difference?" />
      </Section>

      {/* =============================================== Further reading */}
      <Section
        id="further-reading"
        kicker="Go deeper"
        title="Primary sources & docs"
        intro="The original papers and the canonical vendor/standards documentation behind every claim in this chapter."
      >
        <FurtherReading
          title="Further reading"
          sources={[
            {
              title: "A Relational Model of Data for Large Shared Data Banks (Codd, 1970)",
              url: "https://dl.acm.org/doi/10.1145/362384.362685",
              note: "The founding paper (CACM, June 1970). Codd's argument for hiding the access path and laying data out as relations — the move that beat IMS and CODASYL.",
            },
            {
              title: "MongoDB — Embedded Data vs. References",
              url: "https://www.mongodb.com/docs/manual/data-modeling/concepts/embedding-vs-references/",
              note: "The document-store playbook: embed one-to-many trees for locality, but use references (and avoid embedding) for many-to-many.",
            },
            {
              title: "Neo4j Cypher Manual — Variable-length patterns",
              url: "https://neo4j.com/docs/cypher-manual/current/patterns/variable-length-paths/",
              note: "The data-dependent traversal at the heart of the graph model. *0.. is the legacy form; {0,} is the modern GQL-conformant quantifier.",
            },
            {
              title: "W3C — RDF 1.1 Concepts and Abstract Syntax",
              url: "https://www.w3.org/TR/rdf11-concepts/",
              note: "The standard triple model: every fact is a (subject, predicate, object) statement — one vertex-plus-edge in graph terms.",
            },
            {
              title: "W3C — SPARQL 1.1 Query Language",
              url: "https://www.w3.org/TR/sparql11-query/",
              note: "The declarative query language for RDF triple-stores; pattern-matches subgraphs the way SQL pattern-matches rows.",
            },
            {
              title: "TAO: Facebook's Distributed Data Store for the Social Graph (USENIX ATC '13)",
              url: "https://www.usenix.org/system/files/conference/atc13/atc13-bronson.pdf",
              note: "A real, planet-scale objects-and-associations graph store — the production reality behind the property-graph model.",
            },
          ]}
        />
      </Section>

      {/* ==================================================== Test yourself */}
      <Section id="test" kicker="Practice" title="Test yourself">
        <Prose>
          <p>
            Generate a fresh quiz on this chapter, then talk any answer through with the tutor — it&apos;s
            grounded in the exact concepts above, from impedance mismatch to variable-length traversal.
          </p>
        </Prose>
        <Quiz chapterTitle="Data Models & Query Languages" concepts={CONCEPTS} />
        <div className="mt-6">
          <AskClaude chapterTitle="Data Models & Query Languages" concepts={CONCEPTS} />
        </div>
      </Section>

      <KeyTakeaways
        points={[
          "Pick a data model from your relationships and access patterns: documents for tree-shaped one-to-many data, relational/graph for many-to-many.",
          "The object–relational impedance mismatch is the cost of shredding nested objects into flat tables and re-stitching them on read; ORMs ease but don't erase it.",
          "Documents win on locality (one read loads the whole record) and schema flexibility, but have weak joins — many-to-many forces duplication or app-side joins.",
          "'Schemaless' really means schema-on-read (implicit, dynamic-typing-like) vs relational schema-on-write (enforced, static-typing-like).",
          "Declarative queries (SQL) state the pattern and let the optimizer choose the access path — enabling new indexes and parallelism without rewrites; imperative code pins the order and blocks both.",
          "MapReduce uses pure map/reduce functions so the framework can parallelize and retry; declarative aggregation pipelines later reclaimed that flexibility.",
          "Graphs make relationships first-class (property graphs, RDF triples, Datalog rules). Variable-length traversal (Cypher *0..) means the join count is data-dependent, not fixed in advance.",
        ]}
      />
    </ChapterShell>
  );
}
