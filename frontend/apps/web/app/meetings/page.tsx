"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/auth-context";
import {
  listMeetings,
  createMeeting,
  syncCalendar,
  type Meeting,
  type MeetingStatus,
  type CreateMeetingInput,
} from "../../lib/graphql";
import styles from "./page.module.css";

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

function MeetingCard({ meeting }: { meeting: Meeting }) {
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

function MeetingsContent() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filter, setFilter] = useState<FilterStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
            <MeetingCard key={meeting.meeting_id} meeting={meeting} />
          ))}
        </div>
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
            disabled={syncing}
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
        <MeetingsContent />
      </main>
    </div>
  );
}
