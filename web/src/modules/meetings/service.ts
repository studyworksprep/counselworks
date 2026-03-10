import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Meeting,
  MeetingAttendee,
  CreateMeetingInput,
  UpdateMeetingInput,
} from './types';

export async function getMeetingsByFirm(
  client: SupabaseClient,
  firmId: string,
): Promise<{ data: Meeting[]; error: Error | null }> {
  const { data, error } = await client
    .from('meetings')
    .select('*')
    .eq('firm_id', firmId)
    .eq('is_cancelled', false)
    .order('start_time', { ascending: true });

  return { data: (data as Meeting[]) ?? [], error };
}

export async function getMeetingsByStudent(
  client: SupabaseClient,
  studentId: string,
): Promise<{ data: Meeting[]; error: Error | null }> {
  const { data, error } = await client
    .from('meetings')
    .select('*')
    .eq('student_id', studentId)
    .eq('is_cancelled', false)
    .order('start_time', { ascending: true });

  return { data: (data as Meeting[]) ?? [], error };
}

export async function getMeetingById(
  client: SupabaseClient,
  meetingId: string,
): Promise<{ data: Meeting | null; error: Error | null }> {
  const { data, error } = await client
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  return { data: data as Meeting | null, error };
}

export async function createMeeting(
  client: SupabaseClient,
  input: CreateMeetingInput,
): Promise<{ data: Meeting | null; error: Error | null }> {
  const { attendee_user_ids, ...meetingFields } = input;

  const { data, error } = await client
    .from('meetings')
    .insert(meetingFields)
    .select('*')
    .single();

  if (error || !data) {
    return { data: null, error };
  }

  if (attendee_user_ids && attendee_user_ids.length > 0) {
    const attendeeRows = attendee_user_ids.map((userId: string) => ({
      meeting_id: (data as Meeting).id,
      user_id: userId,
      attendance_status: 'pending' as const,
    }));

    await client.from('meeting_attendees').insert(attendeeRows);
  }

  return { data: data as Meeting, error: null };
}

export async function updateMeeting(
  client: SupabaseClient,
  meetingId: string,
  input: UpdateMeetingInput,
): Promise<{ data: Meeting | null; error: Error | null }> {
  const { data, error } = await client
    .from('meetings')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', meetingId)
    .select('*')
    .single();

  return { data: data as Meeting | null, error };
}

export async function addAttendee(
  client: SupabaseClient,
  input: { meeting_id: string; user_id: string; attendance_status?: MeetingAttendee['attendance_status'] },
): Promise<{ data: MeetingAttendee | null; error: Error | null }> {
  const { data, error } = await client
    .from('meeting_attendees')
    .insert({
      meeting_id: input.meeting_id,
      user_id: input.user_id,
      attendance_status: input.attendance_status ?? 'pending',
    })
    .select('*')
    .single();

  return { data: data as MeetingAttendee | null, error };
}

export async function getUpcomingMeetings(
  client: SupabaseClient,
  firmId: string,
  days = 7,
): Promise<{ data: Meeting[]; error: Error | null }> {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const { data, error } = await client
    .from('meetings')
    .select('*')
    .eq('firm_id', firmId)
    .eq('is_cancelled', false)
    .gte('start_time', now.toISOString())
    .lte('start_time', future.toISOString())
    .order('start_time', { ascending: true });

  return { data: (data as Meeting[]) ?? [], error };
}
