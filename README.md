# FlowStory

AI-agent-first animated flow diagram framework. Define architecture flows in JSON — the engine handles canvas rendering, step-by-step animation, and interactive playback.

## What Makes FlowStory Different

- **AI-agent-first**: Designed for Claude, GPT, and other AI tools to generate diagrams programmatically — not drag-and-drop
- **Animated storytelling**: Step-by-step narrative flows that tell a story, not static diagrams
- **Declarative JSON**: Define nodes, flows, tooltips, and inspector mutations in a single JSON file
- **Zero dependencies**: Pure canvas-based rendering, no external libraries

## Quick Start

```html
<script type="module">
  import { FlowStory } from 'https://unpkg.com/flowstory';
  const viz = new FlowStory(document.getElementById('canvas'));
  await viz.load('./diagram.json');
  viz.play();
</script>
```

## For AI Agents

See [CLAUDE.md](CLAUDE.md) for the complete guide to generating FlowStory diagrams.

See [docs/agent-prompt.md](docs/agent-prompt.md) for a copy-pasteable prompt you can use with any AI tool.

## Examples

- [AI Inference Gateway](examples/ai-gateway/) — Red Hat AI Gateway architecture flow
- [Hello World](examples/hello-world/) — Minimal 3-node example

## Gallery

Browse community-created diagrams at [flowstory.dev/gallery](https://flowstory.dev/gallery).

## License

Apache 2.0
