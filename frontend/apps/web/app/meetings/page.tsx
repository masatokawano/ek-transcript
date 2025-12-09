"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import {
  listMeetings,
  createMeeting,
  syncCalendar,
  syncMeetRecordings,
  analyzeRecording,
  updateMeeting,
  type Meeting,
  type MeetingStatus,
  type CreateMeetingInput,
  type Recording,
} from "../../lib/graphql";
import { GoogleConnectButton } from "../../components/GoogleConnectButton";
import styles from "./page.module.css";

type ViewMode = "list" | "calendar";

type FilterStatus = "ALL" | MeetingStatus;

const STATUS_LABELS: Record<MeetingStatus, string> = {
  SCHEDULED: "予定",
  IN_PROGRESS: "進行中",
  COMPLETED: "完了",
  CANCELLED: "キャンセル",
  RECORDING_AVAILABLE: "録画あり",
  PROCESSING: "処理中",
  ANALYZED: "分析済",
};

const STATUS_CLASSES: Record<MeetingStatus, string> = {
  SCHEDULED: styles.statusScheduled ?? "",
  IN_PROGRESS: styles.statusInProgress ?? "",
  COMPLETED: styles.statusCompleted ?? "",
  CANCELLED: styles.statusCancelled ?? "",
  RECORDING_AVAILABLE: styles.statusRecordingAvailable ?? "",
  PROCESSING: styles.statusProcessing ?? "",
  ANALYZED: styles.statusAnalyzed ?? "",
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const startStr = formatDateTime(start);
  const endStr = endDate.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${startStr} - ${endStr}`;
}

function StatusBadge({ status }: { status: MeetingStatus }) {
  return (
    <span className={`${styles.statusBadge} ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateMeetingInput) => Promise<void>;
}

function CreateMeetingModal({ isOpen, onClose, onSubmit }: CreateMeetingModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [autoRecording, setAutoRecording] = useState(true);
  const [autoTranscription, setAutoTranscription] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onSubmit({
        title,
        description: description || undefined,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        auto_recording: autoRecording,
        auto_transcription: autoTranscription,
      });
      onClose();
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create meeting");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>新規会議作成</h2>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="title">
              タイトル *
            </label>
            <input
              className={styles.input}
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="例: HEMS インタビュー #8"
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="description">
              説明
            </label>
            <textarea
              className={styles.textarea}
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="会議の説明（任意）"
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="startTime">
              開始日時 *
            </label>
            <input
              className={styles.input}
              type="datetime-local"
              id="startTime"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="endTime">
              終了日時 *
            </label>
            <input
              className={styles.input}
              type="datetime-local"
              id="endTime"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>
          <div className={styles.checkboxGroup}>
            <input
              className={styles.checkbox}
              type="checkbox"
              id="autoRecording"
              checked={autoRecording}
              onChange={(e) => setAutoRecording(e.target.checked)}
            />
            <label className={styles.checkboxLabel} htmlFor="autoRecording">
              自動録画を有効にする
            </label>
          </div>
          <div className={styles.checkboxGroup}>
            <input
              className={styles.checkbox}
              type="checkbox"
              id="autoTranscription"
              checked={autoTranscription}
              onChange={(e) => setAutoTranscription(e.target.checked)}
            />
            <label className={styles.checkboxLabel} htmlFor="autoTranscription">
              自動文字起こしを有効にする
            </label>
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={submitting}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={submitting}
            >
              {submitting ? "作成中..." : "作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MeetingCardProps {
  meeting: Meeting;
  onEnableRecording?: (meetingId: string) => void;
  enablingRecording?: boolean;
}

function MeetingCard({ meeting, onEnableRecording, enablingRecording }: MeetingCardProps) {
  const isScheduled = meeting.status === "SCHEDULED";
  const isFuture = new Date(meeting.start_time) > new Date();
  const showEnableRecording = isScheduled && isFuture && !meeting.auto_recording;

  return (
    <div className={styles.meetingCard}>
      <div className={styles.meetingHeader}>
        <h3 className={styles.meetingTitle}>{meeting.title}</h3>
        <StatusBadge status={meeting.status} />
      </div>
      {meeting.description && (
        <p className={styles.meetingDescription}>{meeting.description}</p>
      )}
      <div className={styles.meetingMeta}>
        <span className={styles.meetingTime}>
          {formatDateTimeRange(meeting.start_time, meeting.end_time)}
        </span>
        <div className={styles.meetingBadges}>
          {meeting.auto_recording && (
            <span className={styles.featureBadge}>録画</span>
          )}
          {meeting.auto_transcription && (
            <span className={styles.featureBadge}>文字起こし</span>
          )}
          {showEnableRecording && onEnableRecording && (
            <button
              className={styles.enableRecordingButton}
              onClick={(e) => {
                e.stopPropagation();
                onEnableRecording(meeting.meeting_id);
              }}
              disabled={enablingRecording}
            >
              {enablingRecording ? "..." : "録画＆分析を有効化"}
            </button>
          )}
          {meeting.google_meet_uri && (
            <a
              href={meeting.google_meet_uri}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.meetLink}
              onClick={(e) => e.stopPropagation()}
            >
              Meet に参加
            </a>
          )}
          {meeting.interview_id && (
            <Link
              href={`/interview/${meeting.interview_id}`}
              className={styles.meetLink}
              onClick={(e) => e.stopPropagation()}
            >
              分析結果を見る
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// Calendar View Component
interface CalendarViewProps {
  meetings: Meeting[];
  currentMonth: Date;
  onMonthChange: (date: Date) => void;
}

function CalendarView({ meetings, currentMonth, onMonthChange }: CalendarViewProps) {
  const daysOfWeek = ["日", "月", "火", "水", "木", "金", "土"];

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: Date[] = [];
    const current = new Date(startDate);
    while (current <= lastDay || days.length % 7 !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [currentMonth]);

  const getMeetingsForDay = (date: Date) => {
    return meetings.filter((meeting) => {
      const meetingDate = new Date(meeting.start_time);
      return (
        meetingDate.getFullYear() === date.getFullYear() &&
        meetingDate.getMonth() === date.getMonth() &&
        meetingDate.getDate() === date.getDate()
      );
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  const prevMonth = () => {
    const prev = new Date(currentMonth);
    prev.setMonth(prev.getMonth() - 1);
    onMonthChange(prev);
  };

  const nextMonth = () => {
    const next = new Date(currentMonth);
    next.setMonth(next.getMonth() + 1);
    onMonthChange(next);
  };

  const getEventClass = (meeting: Meeting) => {
    if (meeting.status === "RECORDING_AVAILABLE" || meeting.status === "ANALYZED") {
      return styles.dayEventRecording;
    }
    if (meeting.status === "COMPLETED") {
      return styles.dayEventCompleted;
    }
    return styles.dayEventScheduled;
  };

  return (
    <div className={styles.calendarSection}>
      <div className={styles.calendarHeader}>
        <h3 className={styles.sectionTitle}>カレンダー</h3>
        <div className={styles.calendarNav}>
          <button className={styles.calendarNavButton} onClick={prevMonth}>
            &lt;
          </button>
          <span className={styles.calendarMonth}>
            {currentMonth.getFullYear()}年{currentMonth.getMonth() + 1}月
          </span>
          <button className={styles.calendarNavButton} onClick={nextMonth}>
            &gt;
          </button>
        </div>
      </div>
      <div className={styles.calendarGrid}>
        {daysOfWeek.map((day) => (
          <div key={day} className={styles.dayHeader}>
            {day}
          </div>
        ))}
        {calendarDays.map((date, index) => {
          const dayMeetings = getMeetingsForDay(date);
          const cellClasses = [
            styles.dayCell,
            !isCurrentMonth(date) && styles.dayCellOtherMonth,
            isToday(date) && styles.dayCellToday,
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={index} className={cellClasses}>
              <div className={styles.dayNumber}>{date.getDate()}</div>
              <div className={styles.dayEvents}>
                {dayMeetings.slice(0, 3).map((meeting) => (
                  <div
                    key={meeting.meeting_id}
                    className={`${styles.dayEvent} ${getEventClass(meeting)}`}
                    title={meeting.title}
                  >
                    {meeting.title}
                  </div>
                ))}
                {dayMeetings.length > 3 && (
                  <div className={styles.dayEvent}>+{dayMeetings.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Recordings Section Component
interface RecordingsSectionProps {
  recordings: Recording[];
  onAnalyze: (recording: Recording) => void;
  analyzingId: string | null;
}

function RecordingsSection({ recordings, onAnalyze, analyzingId }: RecordingsSectionProps) {
  const unanalyzedRecordings = recordings.filter(
    (r) => r.status !== "ANALYZED" && r.status !== "ANALYZING"
  );

  if (unanalyzedRecordings.length === 0) {
    return (
      <div className={styles.recordingsSection}>
        <h3 className={styles.sectionTitle}>未分析の録画</h3>
        <div className={styles.emptyRecordings}>
          <p className={styles.emptyRecordingsText}>
            未分析の録画はありません。「録画を同期」で最新の録画を取得してください。
          </p>
        </div>
      </div>
    );
  }

  const formatRecordingTime = (startTime?: string | null, endTime?: string | null) => {
    if (!startTime) return "";
    const start = new Date(startTime);
    const dateStr = start.toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
    });
    const startStr = start.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (endTime) {
      const end = new Date(endTime);
      const endStr = end.toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${dateStr} ${startStr} - ${endStr}`;
    }
    return `${dateStr} ${startStr}`;
  };

  return (
    <div className={styles.recordingsSection}>
      <h3 className={styles.sectionTitle}>未分析の録画 ({unanalyzedRecordings.length})</h3>
      <div className={styles.recordingsList}>
        {unanalyzedRecordings.map((recording) => (
          <div key={recording.recording_name} className={styles.recordingCard}>
            <div className={styles.recordingInfo}>
              <p className={styles.recordingTitle}>
                {recording.conference_record.split("/").pop()}
              </p>
              <span className={styles.recordingMeta}>
                {formatRecordingTime(recording.start_time, recording.end_time)}
                {" | Drive ID: "}
                {recording.drive_file_id.substring(0, 12)}...
              </span>
            </div>
            <div className={styles.recordingActions}>
              {recording.export_uri && (
                <a
                  href={recording.export_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.viewButton}
                >
                  Drive で見る
                </a>
              )}
              <button
                className={styles.analyzeButton}
                onClick={() => onAnalyze(recording)}
                disabled={analyzingId === recording.recording_name}
              >
                {analyzingId === recording.recording_name ? "分析中..." : "分析する"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingsContent() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingRecordings, setSyncingRecordings] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [enablingRecording, setEnablingRecording] = useState<string | null>(null);

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const statusFilter = filter === "ALL" ? undefined : filter;
      const result = await listMeetings(50, undefined, statusFilter);
      const sortedItems = [...result.items].sort(
        (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      );
      setMeetings(sortedItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [filter]);

  const handleCreateMeeting = async (input: CreateMeetingInput) => {
    await createMeeting(input);
    await fetchMeetings();
  };

  const handleSyncCalendar = async () => {
    setSyncing(true);
    try {
      await syncCalendar();
      await fetchMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync calendar");
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncRecordings = async () => {
    setSyncingRecordings(true);
    try {
      const result = await syncMeetRecordings({ days_back: 30 });
      setRecordings(result.recordings_found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync recordings");
    } finally {
      setSyncingRecordings(false);
    }
  };

  const handleAnalyzeRecording = async (recording: Recording) => {
    setAnalyzingId(recording.recording_name);
    try {
      await analyzeRecording(recording.drive_file_id, recording.recording_name);
      // Update recording status locally
      setRecordings((prev) =>
        prev.map((r) =>
          r.recording_name === recording.recording_name
            ? { ...r, status: "ANALYZING" as const }
            : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze recording");
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleEnableRecording = async (meetingId: string) => {
    setEnablingRecording(meetingId);
    try {
      await updateMeeting({
        meeting_id: meetingId,
        auto_recording: true,
        auto_transcription: true,
      });
      await fetchMeetings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable recording");
    } finally {
      setEnablingRecording(null);
    }
  };

  const filteredMeetings = filter === "ALL"
    ? meetings
    : meetings.filter((m) => m.status === filter);

  const filterOptions: { value: FilterStatus; label: string }[] = [
    { value: "ALL", label: "すべて" },
    { value: "SCHEDULED", label: "予定" },
    { value: "IN_PROGRESS", label: "進行中" },
    { value: "COMPLETED", label: "完了" },
    { value: "RECORDING_AVAILABLE", label: "録画あり" },
    { value: "ANALYZED", label: "分析済" },
  ];

  if (loading) {
    return <div className={styles.loading}>Loading meetings...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.content}>
      {/* View Toggle */}
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewToggleButton} ${viewMode === "list" ? styles.viewToggleButtonActive : ""}`}
          onClick={() => setViewMode("list")}
        >
          一覧
        </button>
        <button
          className={`${styles.viewToggleButton} ${viewMode === "calendar" ? styles.viewToggleButtonActive : ""}`}
          onClick={() => setViewMode("calendar")}
        >
          カレンダー
        </button>
        <button
          className={styles.syncRecordingsButton}
          onClick={handleSyncRecordings}
          disabled={syncingRecordings}
          style={{ marginLeft: "auto" }}
        >
          {syncingRecordings ? "同期中..." : "録画を同期"}
        </button>
      </div>

      {/* Recordings Section */}
      {recordings.length > 0 && (
        <RecordingsSection
          recordings={recordings}
          onAnalyze={handleAnalyzeRecording}
          analyzingId={analyzingId}
        />
      )}

      {/* Calendar or List View */}
      {viewMode === "calendar" ? (
        <CalendarView
          meetings={meetings}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
        />
      ) : (
        <>
          <div className={styles.filters}>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                className={`${styles.filterButton} ${filter === option.value ? styles.filterButtonActive : ""}`}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {filteredMeetings.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📅</div>
              <p className={styles.emptyText}>
                {filter === "ALL"
                  ? "会議がありません。新しい会議を作成するか、カレンダーを同期してください。"
                  : `「${filterOptions.find((o) => o.value === filter)?.label}」の会議はありません。`}
              </p>
            </div>
          ) : (
            <div className={styles.meetingList}>
              {filteredMeetings.map((meeting) => (
                <MeetingCard
                  key={meeting.meeting_id}
                  meeting={meeting}
                  onEnableRecording={handleEnableRecording}
                  enablingRecording={enablingRecording === meeting.meeting_id}
                />
              ))}
            </div>
          )}
        </>
      )}

      <CreateMeetingModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateMeeting}
      />

      <button
        className={styles.createButton}
        onClick={() => setShowModal(true)}
        style={{ position: "fixed", bottom: 24, right: 24, height: 48, padding: "0 24px" }}
      >
        + 新規会議
      </button>
    </div>
  );
}

export default function MeetingsPage() {
  const { isAuthenticated, isLoading, user, signOut } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);

  const handleSyncCalendar = async () => {
    setSyncing(true);
    try {
      await syncCalendar();
      window.location.reload();
    } catch (err) {
      console.error("Failed to sync calendar:", err);
    } finally {
      setSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authBox}>
          <h1 className={styles.authTitle}>Sign In Required</h1>
          <p style={{ textAlign: "center", marginBottom: 16 }}>
            会議を表示するにはサインインが必要です。
          </p>
          <Link href="/dashboard" className={styles.navLink} style={{ justifyContent: "center" }}>
            サインインページへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Meetings</h1>
        <div className={styles.headerActions}>
          <button
            className={styles.syncButton}
            onClick={handleSyncCalendar}
            disabled={syncing || !googleConnected}
            title={!googleConnected ? "Google アカウントを接続してください" : ""}
          >
            {syncing ? "同期中..." : "カレンダー同期"}
          </button>
          <Link href="/dashboard" className={styles.navLink}>
            Dashboard
          </Link>
          <Link href="/upload" className={styles.navLink}>
            Upload
          </Link>
          <span style={{ fontSize: 14, opacity: 0.7 }}>{user?.email || user?.username}</span>
          <button className={styles.navLink} onClick={signOut}>
            Sign Out
          </button>
        </div>
      </header>
      <main>
        <div style={{ marginBottom: 24 }}>
          <GoogleConnectButton onConnectionChange={setGoogleConnected} />
        </div>
        <MeetingsContent />
      </main>
    </div>
  );
}
