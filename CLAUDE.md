# CLAUDE.md

## What FlowStory Is

FlowStory is an AI-agent-first framework for creating animated, step-by-step architecture flow diagrams from declarative JSON. You define nodes, flows, tooltips, and inspector mutations in a single `diagram.json` file; the engine handles canvas rendering, dot animation, and interactive playback.

## JSON Schema Reference

A FlowStory diagram is a single JSON object with these top-level keys:

### `meta` (required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Diagram title displayed at top center |
| `author` | string | no | Author name (metadata only) |
| `branding` | object | no | `{ logo: "path.svg", title: "Company" }` shown top-left |

### `canvas` (optional)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `width` | number | 1250 | Logical canvas width in design units |
| `height` | number | 1050 | Logical canvas height in design units |

### `nodes` (required)

Object keyed by node ID string. Each node:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `x` | number | -- | X position (top-left origin) |
| `y` | number | -- | Y position |
| `w` | number | -- | Width |
| `h` | number | -- | Height |
| `label` | string | -- | Display text |
| `type` | string | `"box"` | One of: `"box"`, `"icon"`, `"container"`, `"boundary"`, `"plugin"` |
| `sublabel` | string | -- | Smaller text below label |
| `color` | hex string | `"#58a6ff"` | Node border/accent color |
| `fontSize` | number | 16 | Label font size |
| `inner` | boolean | false | Visual hint that node is inside a container |
| `soon` | boolean | false | Adds "COMING SOON" badge |
| `sections` | array | -- | Container-only: plugin section regions (see below) |
| `stackCount` | number | -- | Number of stacked shadow layers behind the node |
| `stackOffset` | object | `{ dx: -8, dy: -5 }` | Per-layer offset for stack shadows |
| `subBoundaries` | array | -- | Boundary-only: inset dashed sub-regions |
| `labelAlign` | string | `"right"` | Boundary-only: `"left"` or `"right"` |
| `labelColor` | hex string | -- | Boundary-only: override label color |

**Sections** (on container nodes):
```json
"sections": [
  { "label": "Request Plugins ->", "y": 300, "height": 260, "color": "#58a6ff" },
  { "label": "<- Response Plugins", "y": 623, "height": 105, "color": "#3fb950" }
]
```
Each section: `{ x?, y, w?, h or height, color, label, labelX?, labelY? }`. Position is in logical coords. If `x` and `w` are omitted, the section fills the container width.

**SubBoundaries** (on boundary nodes):
```json
"subBoundaries": [
  { "x": 235, "y": 933, "w": 230, "h": 82, "color": "#d2a8ff44" }
]
```

### `tooltips` (optional)

Object keyed by node ID. Each tooltip is shown when the user clicks a node:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | yes | Overlay card title |
| `description` | string | no | Description paragraph |
| `details` | array | no | Array of `[key, value]` pairs displayed as a table |
| `links` | array | no | Array of `[text, url]` pairs displayed as buttons |
| `logo` | string | no | Path to logo image shown above title |

Example:
```json
"tooltips": {
  "server": {
    "title": "API Server",
    "description": "Handles all REST API requests.",
    "details": [
      ["Port", "8080"],
      ["Protocol", "HTTP/2"]
    ],
    "links": [
      ["Docs", "https://example.com/docs"]
    ]
  }
}
```

### `flows` (required)

Object keyed by flow ID. Each flow:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | yes | Display name in the flow selector dropdown |
| `steps` | array | yes | Ordered array of step objects |

**Arrow step** -- animates a dot traveling between nodes, then draws a permanent arrow:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | yes | Step description shown in the steps panel |
| `mode` | `"arrow"` | yes | Step type |
| `from` | string | yes | Source node ID |
| `to` | string | yes | Target node ID |
| `color` | hex string | yes | Arrow color |
| `num` | number | yes | Badge number displayed at arrow midpoint |
| `glow` | string | no | Container node ID to glow when arrow arrives |
| `fromRight` | boolean | no | Attach arrow from right edge of source |
| `fromLeft` | boolean | no | Attach from left edge |
| `fromTop` | boolean | no | Attach from top edge |
| `fromBottom` | boolean | no | Attach from bottom edge |
| `toRight` | boolean | no | Attach arrow to right edge of target |
| `toLeft` | boolean | no | Attach to left edge |
| `toTop` | boolean | no | Attach to top edge |
| `toBottom` | boolean | no | Attach to bottom edge |
| `fromXOff` | number | no | Horizontal offset on source edge |
| `toXOff` | number | no | Horizontal offset on target edge |
| `yOff` | number | no | Vertical offset for edge attachment |
| `waypoints` | array | no | Array of `{ x, y }` intermediate points for multi-segment arrows |

Alternative edge syntax (normalized by loader to flat flags):
```json
"edge": {
  "fromSide": "right",
  "toSide": "left",
  "fromXOffset": 10,
  "toXOffset": -5,
  "yOffset": 8,
  "waypoints": [{ "x": 500, "y": 300 }]
}
```

If no direction flags are set, the engine auto-calculates the nearest edge intersection point.

**Lightup step** -- instantly highlights a node with a badge (no animation travel):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | yes | Step description |
| `mode` | `"lightup"` | yes | Step type |
| `target` | string | yes | Node ID to highlight |
| `badge` | number or string | yes | Badge value shown on the node |
| `errColor` | hex string | no | Override node color (for error states) |

### `inspector` (optional)

Drives the request/response inspector panel on the right side:

```json
"inspector": {
  "initialState": {
    "phase": "request",
    "headers": [
      { "value": "POST /v1/chat/completions", "style": "keep", "id": "h-path" },
      { "value": "Authorization: Bearer sk-...", "style": "keep", "id": "h-auth" }
    ],
    "body": [
      { "value": "\"model\": \"gpt-4o\"", "style": "keep", "id": "b-model" }
    ],
    "cycleState": []
  },
  "mutations": {
    "flow-id": [
      {
        "step": 3,
        "label": "Step label text",
        "phase": "response",
        "actions": [
          { "id": "h-auth", "style": "highlight" },
          { "action": "add", "target": "headers", "value": "x-api-key: sk-...", "id": "h-xapi" },
          { "action": "remove", "id": "h-auth" }
        ],
        "replaceHeaders": [{ "value": "...", "style": "keep", "id": "..." }],
        "replaceBody": [{ "value": "...", "style": "keep", "id": "..." }],
        "cycleState": [{ "value": "provider = \"openai\"", "style": "add", "id": "c-prov" }],
        "clearCycleState": true
      }
    ]
  }
}
```

**Line styles**: `"keep"` (dim), `"highlight"` (blue pulse), `"add"` (green, left border), `"del"` (red, strikethrough), `"err"` (red, bold).

**Mutation actions**:
- `{ "id": "h-auth", "style": "highlight" }` -- change a line's style
- `{ "action": "add", "target": "headers"|"body"|"cycleState", "value": "...", "id": "...", "style?": "add" }` -- append a line
- `{ "action": "remove", "id": "..." }` -- remove a line
- `{ "action": "replaceHeaders", "headers": [...] }` -- wholesale replace headers
- `{ "action": "replaceBody", "body": [...] }` -- wholesale replace body
- `{ "action": "clearCycleState" }` -- empty cycleState
- `{ "action": "setCycleState", "cycleState": [...] }` -- replace cycleState

### `legend` (optional)

Array of legend entries displayed bottom-left:
```json
"legend": [
  { "label": "Request", "color": "#58a6ff" },
  { "label": "Response", "color": "#3fb950" }
]
```

### `flowOrder` (optional)

Array of flow ID strings controlling the order in the dropdown and loop playback:
```json
"flowOrder": ["request", "response", "error"]
```
Defaults to `Object.keys(flows)` insertion order.

### `defaultFlow` (optional)

String. The flow ID to select on load. Defaults to the first flow.

## Coordinate System

- Logical canvas: 1250x1050 by default (configurable via `canvas`)
- Origin: top-left corner (0, 0)
- X increases rightward, Y increases downward
- Negative x values place nodes outside the main diagram area (useful for external actors like "Client" at x=-20)
- The engine auto-scales the logical space to fit the browser window, maintaining aspect ratio
- A 380px right panel is reserved for the steps/inspector UI

## Node Types

| Type | Visual | Use For |
|------|--------|---------|
| `"box"` (default) | Solid rounded rectangle with label | Services, components, endpoints |
| `"icon"` | Person silhouette emoji + label | End users, clients |
| `"container"` | Dashed border with small label, optional glow | Grouping related nodes (e.g., plugin set) |
| `"boundary"` | Large outermost dashed border | Infrastructure boundaries (cluster, pool) |
| `"plugin"` | Dashed-border box (like `"box"` but dashed) | Individual plugins inside containers |

Rendering order (back to front): boundaries, containers, sections, sub-boundaries, stack decorations, regular nodes.

## Color Conventions

| Color | Hex | Use |
|-------|-----|-----|
| Blue | `#58a6ff` | Request path, default node color |
| Green | `#3fb950` | Response path |
| Orange | `#f0883e` | Auth, rate limiting, warnings |
| Red | `#f85149` | Errors (errColor on lightup steps) |
| Purple | `#d2a8ff` | Plugin containers, grouped components |
| Gray | `#8b949e` | Infrastructure, sidecars, support components |
| Light blue | `#79c0ff` | Schedulers, supplementary services |

## Common Patterns

**Request-response flow**: Arrow steps going left-to-right (blue `#58a6ff`), then right-to-left (green `#3fb950`). Use `fromRight`/`toLeft` for outgoing, `fromLeft`/`toRight` for return.

**Error flow**: Same start as happy path, then diverge with red `#f85149` arrows. Use `errColor` on lightup steps to turn nodes red.

**Processing pipeline**: Sequence of lightup steps on plugin nodes inside a container, with `glow` on the container in the first arrow step entering it.

**Multi-segment arrows**: Use `waypoints` for arrows that need to go around obstacles:
```json
{ "from": "a", "to": "b", "waypoints": [{ "x": 500, "y": 100 }, { "x": 500, "y": 400 }] }
```

## Layout Tips

- For a simple left-to-right flow with 5 nodes, space them at x = 0, 250, 500, 750, 1000 with y centered around 400-500
- Use negative x (e.g., -40) for external actors (clients, providers) outside a cluster boundary
- Containers should wrap their children with approximately 20-30px padding on all sides
- Boundaries need more padding (30-50px) since they contain containers
- Plugin nodes inside a container: stack them vertically with 2-4px gaps, all same width
- When arrows overlap, use `fromXOff`/`toXOff` to spread attachment points along an edge
- For return arrows that parallel request arrows, use `yOff` to offset vertically (e.g., request at yOff=-10, response at yOff=10)
- Keep node heights proportional: 40-60px for regular boxes, 50px for icons, 60-80px for important nodes

## Development

```bash
# Start dev server on port 9000
npm run dev

# Validate a diagram
npm run validate -- path/to/diagram.json

# Run tests
npm test
```

Edit `diagram.json`, refresh browser. The screenshot feedback loop with Claude Code is the primary workflow: generate JSON, screenshot the result, paste into Claude Code, describe adjustments, iterate.

## Minimal Example (Hello World)

```json
{
  "meta": { "title": "Hello World" },
  "canvas": { "width": 800, "height": 400 },
  "nodes": {
    "client": { "x": 50,  "y": 150, "w": 100, "h": 50, "label": "Client", "type": "icon" },
    "server": { "x": 300, "y": 140, "w": 200, "h": 70, "label": "API Server", "color": "#58a6ff" },
    "db":     { "x": 650, "y": 150, "w": 120, "h": 50, "label": "Database", "color": "#3fb950" }
  },
  "flows": {
    "main": {
      "label": "Request Flow",
      "steps": [
        { "text": "Client sends request",  "mode": "arrow", "from": "client", "to": "server", "color": "#58a6ff", "num": 1 },
        { "text": "Server queries database", "mode": "arrow", "from": "server", "to": "db",     "color": "#58a6ff", "num": 2 },
        { "text": "Database responds",       "mode": "arrow", "from": "db",     "to": "server", "color": "#3fb950", "num": 3 },
        { "text": "Server responds to client","mode": "arrow", "from": "server", "to": "client", "color": "#3fb950", "num": 4 }
      ]
    }
  }
}
```
