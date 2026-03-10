import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Conversation,
  Message,
  CreateConversationInput,
  SendMessageInput,
} from './types';

export async function getConversationsByUser(
  client: SupabaseClient,
  userId: string,
  firmId: string,
): Promise<{ data: Conversation[]; error: Error | null }> {
  // Get conversation IDs where the user is an active participant
  const { data: participantData, error: participantError } = await client
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (participantError || !participantData || participantData.length === 0) {
    return { data: [], error: participantError };
  }

  const conversationIds = participantData.map((p) => p.conversation_id);

  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('firm_id', firmId)
    .eq('is_archived', false)
    .in('id', conversationIds)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  return { data: (data as Conversation[]) ?? [], error };
}

export async function getConversationById(
  client: SupabaseClient,
  conversationId: string,
): Promise<{ data: Conversation | null; error: Error | null }> {
  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();

  return { data: data as Conversation | null, error };
}

export async function createConversation(
  client: SupabaseClient,
  input: CreateConversationInput,
): Promise<{ data: Conversation | null; error: Error | null }> {
  const { participant_user_ids, ...conversationFields } = input;

  const { data, error } = await client
    .from('conversations')
    .insert(conversationFields)
    .select('*')
    .single();

  if (error || !data) {
    return { data: null, error };
  }

  // Add participants
  if (participant_user_ids.length > 0) {
    const participantRows = participant_user_ids.map((userId) => ({
      conversation_id: (data as Conversation).id,
      user_id: userId,
      is_active: true,
      joined_at: new Date().toISOString(),
    }));

    await client.from('conversation_participants').insert(participantRows);
  }

  return { data: data as Conversation, error: null };
}

export async function getMessages(
  client: SupabaseClient,
  conversationId: string,
  limit = 50,
  before?: string,
): Promise<{ data: Message[]; error: Error | null }> {
  let query = client
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data, error } = await query;

  return { data: (data as Message[]) ?? [], error };
}

export async function sendMessage(
  client: SupabaseClient,
  input: SendMessageInput,
): Promise<{ data: Message | null; error: Error | null }> {
  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: input.conversation_id,
      sender_id: input.sender_id,
      content: input.content,
      content_type: input.content_type ?? 'text',
      parent_message_id: input.parent_message_id ?? null,
    })
    .select('*')
    .single();

  if (data) {
    // Update conversation's last message metadata
    await client
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: input.content.substring(0, 200),
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.conversation_id);
  }

  return { data: data as Message | null, error };
}

export async function markMessageRead(
  client: SupabaseClient,
  conversationId: string,
  userId: string,
): Promise<{ data: null; error: Error | null }> {
  const now = new Date().toISOString();

  const { error } = await client
    .from('conversation_participants')
    .update({ last_read_at: now, updated_at: now })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);

  return { data: null, error };
}

export async function getUnreadCount(
  client: SupabaseClient,
  userId: string,
  firmId: string,
): Promise<{ data: number; error: Error | null }> {
  // Get participant records for active conversations
  const { data: participants, error: pError } = await client
    .from('conversation_participants')
    .select('conversation_id, last_read_at')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (pError || !participants || participants.length === 0) {
    return { data: 0, error: pError };
  }

  let unreadCount = 0;

  for (const participant of participants) {
    const query = client
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', participant.conversation_id)
      .eq('is_deleted', false)
      .neq('sender_id', userId);

    if (participant.last_read_at) {
      query.gt('created_at', participant.last_read_at);
    }

    const { count } = await query;
    unreadCount += count ?? 0;
  }

  return { data: unreadCount, error: null };
}
