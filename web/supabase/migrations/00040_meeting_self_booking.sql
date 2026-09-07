-- ===========================================================================
-- Meeting self-booking (fix plan 13.1)
-- ===========================================================================
-- A counselor publishes weekly availability windows (wall-clock in their
-- own IANA timezone) plus booking rules; a parent picks an open slot from
-- the family portal and the app writes an ordinary meeting + attendees.
-- Slots are computed in the app (src/lib/booking/slots.ts) from these rows
-- minus the counselor's existing meetings — nothing here stores slots.

-- ---------------------------------------------------------------------------
-- 1. Per-counselor booking rules
-- ---------------------------------------------------------------------------
CREATE TABLE staff_booking_settings (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enabled             boolean NOT NULL DEFAULT false,
    -- IANA zone the windows below are expressed in (e.g. America/New_York).
    timezone            text NOT NULL,
    slot_minutes        integer NOT NULL DEFAULT 30
                            CHECK (slot_minutes IN (15, 30, 45, 60, 90)),
    min_notice_hours    integer NOT NULL DEFAULT 24
                            CHECK (min_notice_hours BETWEEN 0 AND 336),
    max_days_ahead      integer NOT NULL DEFAULT 30
                            CHECK (max_days_ahead BETWEEN 1 AND 120),
    -- Default location / video link stamped on self-booked meetings.
    location_text       text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (firm_id, user_id)
);

CREATE INDEX idx_staff_booking_settings_firm_id ON staff_booking_settings(firm_id);

ALTER TABLE staff_booking_settings ENABLE ROW LEVEL SECURITY;

-- Every firm member (parents included — they pick slots) reads; only the
-- counselor themself writes their own rules.
CREATE POLICY staff_booking_settings_member_read ON staff_booking_settings
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY staff_booking_settings_self_write ON staff_booking_settings
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff()
           AND user_id = public.current_user_id())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff()
                AND user_id = public.current_user_id());

-- ---------------------------------------------------------------------------
-- 2. Weekly availability windows (minutes from local midnight)
-- ---------------------------------------------------------------------------
CREATE TABLE staff_availability_windows (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id             uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday             smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
    start_minute        integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute          integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (end_minute > start_minute)
);

CREATE INDEX idx_staff_availability_windows_firm_user
    ON staff_availability_windows(firm_id, user_id);

ALTER TABLE staff_availability_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_availability_windows_member_read ON staff_availability_windows
    FOR SELECT USING (firm_id = public.firm_id());
CREATE POLICY staff_availability_windows_self_write ON staff_availability_windows
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff()
           AND user_id = public.current_user_id())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff()
                AND user_id = public.current_user_id());

-- ---------------------------------------------------------------------------
-- 3. Meetings: where a meeting came from, and the parent's insert path
-- ---------------------------------------------------------------------------
-- 'staff' = scheduled from the calendar; 'portal' = self-booked by a family.
-- Read by the calendar detail modal and the workspace meeting lists.
ALTER TABLE meetings
    ADD COLUMN booking_source text NOT NULL DEFAULT 'staff'
        CHECK (booking_source IN ('staff', 'portal'));

-- Parents may insert exactly one shape of meeting: in their own firm, for
-- their own household, authored by themselves, family-visible, marked as a
-- portal booking. They still cannot update or delete meetings (staff_write
-- stays staff-only) — rescheduling goes through the counselor.
CREATE POLICY meetings_family_self_book ON meetings
    FOR INSERT
    WITH CHECK (
        firm_id = public.firm_id()
        AND created_by_user_id = public.current_user_id()
        AND booking_source = 'portal'
        AND visibility_scope = 'family'
        AND family_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM family_members fm
            WHERE fm.family_id = meetings.family_id
              AND fm.firm_id = public.firm_id()
              AND fm.user_id = public.current_user_id()
        )
    );

-- Attendee rows for a meeting the current user just self-booked.
CREATE POLICY meeting_attendees_family_self_book ON meeting_attendees
    FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM meetings m
        WHERE m.id = meeting_attendees.meeting_id
          AND m.firm_id = public.firm_id()
          AND m.booking_source = 'portal'
          AND m.created_by_user_id = public.current_user_id()
    ));
