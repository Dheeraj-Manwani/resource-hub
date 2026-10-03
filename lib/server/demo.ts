import "server-only"

import { detectUrl } from "@/lib/resources/detect"
import { linkResources } from "@/lib/server/dal/project-links"
import { createProject } from "@/lib/server/dal/projects"
import { insertResources, type NewResource } from "@/lib/server/dal/resources"

function fromUrl(
  url: string,
  extra: Omit<Partial<NewResource>, "metadata"> & {
    metadata?: NewResource["metadata"]
  }
): NewResource {
  const detected = detectUrl(url)!
  return {
    type: detected.type,
    url: detected.url,
    urlNormalized: detected.urlNormalized,
    metadataStatus: "ok",
    ...extra,
    metadata: { ...detected.metadata, ...extra.metadata },
  }
}

/**
 * One resource of every type with realistic snapshots (no network needed).
 * Snapshots are illustrative; "Refresh metadata" fetches live values.
 */
export function demoResources(): NewResource[] {
  const noteDoc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Weekly reading plan" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Notes are rich text: " },
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
          { type: "text", text: ", " },
          { type: "text", marks: [{ type: "italic" }], text: "italic" },
          { type: "text", text: ", lists and links." },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Finish the flexbox guide" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Watch one talk per day" }],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "File the Inbox every Friday" },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
  const noteText =
    "Weekly reading plan\nNotes are rich text: bold, italic, lists and links.\nFinish the flexbox guide\nWatch one talk per day\nFile the Inbox every Friday"

  return [
    fromUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw", {
      title: "Me at the zoo",
      tags: ["demo", "video"],
      embedStatus: "ok",
      metadata: {
        title: "Me at the zoo",
        author: "jawed",
        authorUrl: "https://www.youtube.com/@jawed",
        publishedAt: "2005-04-24T03:31:52.000Z",
        youtube: {
          videoId: "jNQXAC9IVRw",
          channel: "jawed",
          durationSeconds: 19,
        },
      },
    }),
    fromUrl("https://x.com/jack/status/20", {
      title: "just setting up my twttr",
      tags: ["demo"],
      metadata: {
        title: "just setting up my twttr",
        description: "just setting up my twttr",
        author: "jack",
        authorUrl: "https://twitter.com/jack",
        publishedAt: "2006-03-21T20:50:14.000Z",
        x: { statusId: "20", handle: "jack", text: "just setting up my twttr" },
      },
    }),
    fromUrl("https://github.com/vercel/next.js", {
      title: "vercel/next.js",
      tags: ["demo", "dev"],
      metadata: {
        title: "vercel/next.js",
        description: "The React Framework",
        author: "vercel",
        image: "https://opengraph.githubassets.com/1/vercel/next.js",
        github: {
          kind: "repo",
          owner: "vercel",
          repo: "next.js",
          stars: 132000,
          forks: 28700,
          language: "JavaScript",
          topics: ["react", "nextjs", "framework", "ssr", "vercel"],
          pushedAt: "2026-10-02T18:00:00.000Z",
        },
      },
    }),
    fromUrl("https://www.instagram.com/p/C0demoPost1/", {
      title: "Instagram post",
      tags: ["demo", "inspiration"],
      metadata: {
        description:
          "Instagram metadata is often minimal; override it from the detail drawer or upload a screenshot as the thumbnail.",
      },
    }),
    fromUrl("https://www.pinterest.com/pin/99360735500167749/", {
      title: "Mountain lake at dawn",
      tags: ["demo", "inspiration"],
      metadata: {
        title: "Mountain lake at dawn",
        description: "Moodboard reference for the landing page hero.",
        image:
          "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=900&q=80",
        imageWidth: 900,
        imageHeight: 600,
      },
    }),
    fromUrl("https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/", {
      title: "An Interactive Guide to Flexbox",
      tags: ["demo", "dev"],
      metadata: {
        title: "An Interactive Guide to Flexbox",
        description:
          "Flexbox is a remarkably powerful layout mode. Once we truly understand how it works, we can build dynamic layouts that respond automatically.",
        siteName: "Josh W. Comeau",
        author: "Josh W. Comeau",
      },
    }),
    {
      type: "image",
      title: "Desk setup reference",
      metadata: {
        image:
          "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1000&q=80",
        imageWidth: 1000,
        imageHeight: 667,
        siteName: "Unsplash",
      },
      url: "https://unsplash.com/photos/macbook-pro-on-brown-wooden-table-npxXWgQ33ZQ",
      metadataStatus: "ok",
      tags: ["demo", "inspiration"],
    },
    {
      type: "note",
      title: "Weekly reading plan",
      bodyJson: noteDoc,
      extractedText: noteText,
      metadata: {},
      metadataStatus: "ok",
      tags: ["demo"],
      isFavorite: true,
    },
    {
      type: "file",
      title: "Sample PDF",
      url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      metadata: {
        siteName: "w3.org",
        description: "A one-page PDF to try the file preview.",
      },
      metadataStatus: "ok",
      tags: ["demo"],
    },
  ]
}

/**
 * Loads one resource of every type plus two demo projects, with a few
 * resources filed into each — the rest stay unfiled, to show off the Inbox.
 */
export async function seedDemoData(userId: string) {
  const created = await insertResources(userId, demoResources().reverse())
  const byTitle = new Map(created.map((r) => [r.title, r.id]))

  const reading = await createProject(userId, {
    name: "Reading list",
    color: "#0EA5E9",
  })
  const moodboard = await createProject(userId, {
    name: "Moodboard",
    color: "#EC4899",
  })
  if (reading) {
    const ids = ["vercel/next.js", "An Interactive Guide to Flexbox"]
      .map((t) => byTitle.get(t))
      .filter((id): id is string => !!id)
    await linkResources(userId, reading.id, ids)
  }
  if (moodboard) {
    const ids = ["Mountain lake at dawn", "Instagram post"]
      .map((t) => byTitle.get(t))
      .filter((id): id is string => !!id)
    await linkResources(userId, moodboard.id, ids)
  }

  return created
}
