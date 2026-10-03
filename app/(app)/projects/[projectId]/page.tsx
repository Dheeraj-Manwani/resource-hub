import { ProjectPage } from "@/components/projects/project-page"
import { getSettings } from "@/lib/server/dal/settings"
import { requireUser } from "@/lib/server/dal/session"

export default async function Page({
  params,
}: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params
  const user = await requireUser()
  const settings = await getSettings(user.id)
  return <ProjectPage projectId={projectId} initialSettings={settings} />
}
