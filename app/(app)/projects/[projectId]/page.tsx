import type { Metadata } from "next"
import { Suspense } from "react"
import { z } from "zod"

import { ProjectPage } from "@/components/projects/project-page"
import { getProjectDto } from "@/lib/server/dal/projects"
import { getSettings } from "@/lib/server/dal/settings"
import { requireUser } from "@/lib/server/dal/session"

export async function generateMetadata({
  params,
}: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const user = await requireUser()
  const { projectId } = await params
  if (!z.uuid().safeParse(projectId).success) return { title: "Project" }
  const project = await getProjectDto(user.id, projectId)
  return { title: project?.name ?? "Project" }
}

export default async function Page({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params
  const user = await requireUser()
  const settings = await getSettings(user.id)
  return (
    <Suspense>
      <ProjectPage projectId={projectId} initialSettings={settings} />
    </Suspense>
  )
}
