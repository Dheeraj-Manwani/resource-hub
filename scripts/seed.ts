import "dotenv/config"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { seedDemoData } from "@/lib/server/demo"

async function main() {
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase()
  if (!email)
    throw new Error(
      "Set SEED_USER_EMAIL to the account that should receive demo data."
    )
  const [target] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1)
  if (!target)
    throw new Error(
      `No user with email ${email}. Sign in once with Google first.`
    )
  const created = await seedDemoData(target.id)
  console.log(`Seeded ${created.length} demo resources for ${email}.`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
