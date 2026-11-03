# Explore Point Loyalty with Graphify

Use Graphify to trace relationships between Point Loyalty contracts, deployment scripts, tests, and design documents. Run the commands below from the repository root.

## Install Graphify

Install Graphify with its Solidity parser using [uv](https://docs.astral.sh/uv/):

```bash
uv tool install 'graphifyy[solidity]'
graphify --help
```

The Solidity extra is required to extract contracts such as `PointTokenBase` and `UpgradablePointFactory`. Check extraction warnings for skipped files.

To use the Graphify skill in Codex, install the skill and start a new Codex session:

```bash
graphify install --platform codex
```

## Build the graph

In a Codex session with the Graphify skill available, enter:

```text
$graphify .
```

The skill extracts code structure and uses the agent to read documents and images. This workflow does not require a separate API key.

For a terminal-only build of code structure, run:

```bash
graphify extract . --code-only
graphify export html
```

The `--code-only` command skips documents and images. Use the skill workflow above when you need their relationships in the graph.

## Open the results

Open `graphify-out/graph.html` in a browser. On macOS, run:

```bash
open graphify-out/graph.html
```

Read `graphify-out/GRAPH_REPORT.md` for communities, connected nodes, suggested questions, and extraction warnings. Use `graphify-out/graph.json` for queries and other tools.

## Ask questions

Use contract and function names in queries so Graphify can match nodes:

```bash
graphify query "How does PointTokenBase connect mint transfer and redeem?"
graphify query "How does FEFO relate to point expiry?" --budget 1500
graphify explain "PointTokenBase"
graphify path "PointTokenBase" "Ownable" --undirected
```

The CLI returns graph context. Ask Codex to explain that context and check the cited source locations for implementation details.

You can also ask in the Codex session that has the Graphify skill:

```text
Use the existing Graphify graph to trace mint, transfer, and redeem.
Use the existing Graphify graph to explain FEFO and point expiry.
```

If a name matches several nodes, use the node ID from the listed candidates. If a question finds no nodes, try a contract or function name from the report.

## Update after changes

To refresh code relationships from the terminal, run:

```bash
graphify update .
graphify export html
```

The terminal update extracts code without an LLM. To refresh changed documents and images as well, enter this in Codex:

```text
$graphify . --update
```

For the existing local build, the interpreter recorded in `graphify-out/.graphify_python` has the Solidity parser. If the global command reports a missing parser, run the code update with that interpreter:

```bash
"$(cat graphify-out/.graphify_python)" -m graphify update .
graphify export html
```

## Keep generated files local

The repository ignores `graphify-out/`, including graph exports, caches, and the local Python environment. Each developer builds their own graph after cloning. Commit this guide and `.gitignore` when sharing the setup.

## Check graph limitations

Read warnings before relying on a relationship. An `EXTRACTED` edge comes from source evidence. `INFERRED` and `AMBIGUOUS` edges need further review.

Dependency helpers can dominate the most-connected-node rankings. Dangling endpoints and collapsed relationships can leave paths incomplete. Graph results depend on the files present during extraction, including uncommitted files, so update the graph when the working tree changes.
