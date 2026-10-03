import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

// Embeds are click-to-load iframes from exactly these platforms (see
// docs/EMBEDS.md); nothing else is ever framed. `img-src` stays broad
// (`https:`) because "generic link" and per-platform cards show whatever
// favicon/OG image the saved page itself provided — those can be any host.
const FRAME_SRC = [
  "https://www.youtube-nocookie.com",
  "https://www.instagram.com",
  "https://platform.twitter.com",
  "https://assets.pinterest.com",
]

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://platform.twitter.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' https: data: blob:;
  font-src 'self';
  connect-src 'self' https://platform.twitter.com;
  frame-src ${FRAME_SRC.join(" ")};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`
  .replace(/\s{2,}/g, " ")
  .trim()

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

export default nextConfig
