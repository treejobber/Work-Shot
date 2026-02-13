/** Chat session states */
export type ChatState = "idle" | "before_received" | "processing";

/** Job status values */
export type JobStatus = "pending" | "processing" | "validated" | "processed" | "error";

/** Message direction */
export type MessageDirection = "inbound" | "outbound";

/** Message role */
export type MessageRole =
  | "before_photo"
  | "after_photo"
  | "details"
  | "result_photo"
  | "error"
  | "system";

/** Job source type */
export type JobSourceType = "manual" | "telegram";

/** Database row for a job */
export interface JobRow {
  id: number;
  job_dir: string;
  job_id: string;
  service: string;
  notes: string | null;
  status: JobStatus;
  layout: string;
  source_type: JobSourceType;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
  run_at: string | null;
}

/** Parameters for inserting a new job */
export interface NewJob {
  job_dir: string;
  job_id: string;
  service?: string;
  notes?: string | null;
  layout?: string;
  source_type: JobSourceType;
}

/** Database row for a chat session */
export interface ChatSessionRow {
  chat_id: number;
  state: ChatState;
  pending_job_id: number | null;
  pending_service: string;
  pending_notes: string | null;
  updated_at: string;
}

/** Database row for a telegram message log entry */
export interface TelegramMessageRow {
  id: number;
  job_id: number | null;
  chat_id: number;
  message_id: number;
  direction: MessageDirection;
  role: MessageRole;
  file_id: string | null;
  text: string | null;
  created_at: string;
}

/** Parameters for logging a telegram message */
export interface NewTelegramMessage {
  job_id: number | null;
  chat_id: number;
  message_id: number;
  direction: MessageDirection;
  role: MessageRole;
  file_id?: string | null;
  text?: string | null;
}

/** Result of running the pipeline */
export interface PipelineResult {
  success: boolean;
  compositeOutputPath?: string;
  captionOutputPath?: string;
  manifestOutputPath?: string;
  captionText?: string;
  error?: string;
}
