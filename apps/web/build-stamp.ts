import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"
import path from "node:path"
import type { Plugin } from "vite"

/**
 * The build stamp (ADR-0091): how an open page learns its server has a newer
 * front end. After the files are written it
 *
 * 1. makes the build's id: a hash of every file in the build, by name and
 *    content. So the id is the front end's own. It changes when the front
 *    end changes, and not when only the server does;
 * 2. writes the id into the page, `<meta name="vale-build" content="…">`;
 * 3. writes `build.json`, `{"build": "<id>"}`, beside it.
 *
 * The page reads its own id from the tag and asks for `build.json` again
 * later (`src/lib/build-watch.ts`). A page without the tag (`vite dev`)
 * does not watch. The id is in the page, not in a script, because it is
 * made from the scripts' final content.
 */
export const BUILD_META = "vale-build"

/** The id of a set of files: 20 hex characters of a SHA-256 over each name and content, in name order. */
export function buildId(files: Iterable<readonly [name: string, content: string | Uint8Array]>): string {
  const hash = createHash("sha256")
  for (const [name, content] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const bytes = typeof content === "string" ? Buffer.from(content) : content
    // Lengths keep one file's end from reading as the next one's start.
    hash.update(`${Buffer.byteLength(name)}:${name}:${bytes.byteLength}:`)
    hash.update(bytes)
  }
  return hash.digest("hex").slice(0, 20)
}

/** The page with its build id, or null when it has no `</head>` to carry it. */
export function stampPage(html: string, id: string): string | null {
  if (!html.includes("</head>")) return null
  return html.replace("</head>", `  <meta name="${BUILD_META}" content="${id}" />\n  </head>`)
}

/** `build.json` for an id. */
export const buildJson = (id: string): string => `${JSON.stringify({ build: id })}\n`

export function buildStamp(): Plugin {
  return {
    name: "vale-build-stamp",
    apply: "build",
    writeBundle(options, bundle) {
      const dir = options.dir
      const page = bundle["index.html"]
      if (!dir || !page || page.type !== "asset") return
      const id = buildId(Object.values(bundle).map((f) => [f.fileName, f.type === "chunk" ? f.code : f.source] as const))
      const html = typeof page.source === "string" ? page.source : Buffer.from(page.source).toString("utf8")
      const stamped = stampPage(html, id)
      if (stamped === null) return this.error("index.html has no </head> to carry the build id")
      writeFileSync(path.join(dir, "index.html"), stamped)
      writeFileSync(path.join(dir, "build.json"), buildJson(id))
    },
  }
}
