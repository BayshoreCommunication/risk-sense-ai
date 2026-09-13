import { ChatSession } from '@/components/chat/ChatSession';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatSession id={id} />;
}
