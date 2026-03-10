export interface Conversation {
  id: string;
  firm_id: string;
  student_id: string | null;
  conversation_type: 'direct' | 'group' | 'student_channel' | 'family_channel' | 'announcement';
  title: string | null;
  is_archived: boolean;
  archived_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type ConversationType = Conversation['conversation_type'];

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  is_active: boolean;
  last_read_at: string | null;
  muted_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  content_type: string;
  parent_message_id: string | null;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface MessageWithSender extends Message {
  users: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  };
}

export interface ConversationWithParticipants extends Conversation {
  conversation_participants: (ConversationParticipant & {
    users: {
      id: string;
      first_name: string;
      last_name: string;
      avatar_url: string | null;
    };
  })[];
}

export type CreateConversationInput = Pick<Conversation, 'firm_id' | 'conversation_type' | 'created_by'> &
  Partial<Pick<Conversation, 'student_id' | 'title'>> & {
    participant_user_ids: string[];
  };

export type SendMessageInput = Pick<Message, 'conversation_id' | 'sender_id' | 'content'> &
  Partial<Pick<Message, 'content_type' | 'parent_message_id'>>;
