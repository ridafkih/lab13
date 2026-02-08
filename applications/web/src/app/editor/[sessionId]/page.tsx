import { redirect } from "next/navigation";

type SessionPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionId } = await params;
  redirect(`/editor/${sessionId}/chat`);
}
