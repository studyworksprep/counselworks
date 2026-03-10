export interface Meeting {
  id: string;
  firm_id: string;
  student_id: string | null;
  organizer_id: string;
  title: string;
  description: string | null;
  meeting_type: 'initial_consultation' | 'regular_session' | 'essay_review' | 'college_list_review' | 'parent_meeting' | 'group_session' | 'other';
  start_time: string;
  end_time: string;
  timezone: string;
  location: string | null;
  video_url: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingAttendee {
  id: string;
  meeting_id: string;
  user_id: string;
  attendance_status: 'pending' | 'accepted' | 'declined' | 'tentative' | 'attended' | 'no_show';
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingWithAttendees extends Meeting {
  meeting_attendees: MeetingAttendee[];
}

export type MeetingType = Meeting['meeting_type'];
export type AttendanceStatus = MeetingAttendee['attendance_status'];

export type CreateMeetingInput = Pick<Meeting, 'firm_id' | 'organizer_id' | 'title' | 'meeting_type' | 'start_time' | 'end_time'> &
  Partial<Pick<Meeting, 'student_id' | 'description' | 'timezone' | 'location' | 'video_url' | 'notes'>> & {
    attendee_user_ids?: string[];
  };

export type UpdateMeetingInput = Partial<Omit<Meeting, 'id' | 'firm_id' | 'organizer_id' | 'created_at' | 'updated_at'>>;
