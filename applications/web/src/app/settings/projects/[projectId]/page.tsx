import { ProjectDetail } from "@/components/settings/project-detail";

type ProjectDetailPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;
  return <ProjectDetail projectId={projectId} />;
}
