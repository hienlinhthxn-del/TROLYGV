
export type Role = 'user' | 'assistant';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface Attachment {
  type: 'image' | 'file' | 'link';
  name: string;
  url?: string;
  data?: string; // base64 for images
  mimeType?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  isStreaming?: boolean;
  sources?: GroundingSource[];
  attachments?: Attachment[];
}

export interface TeacherPersona {
  id: string;
  name: string;
  description: string;
  icon: string;
  instruction: string;
}

// Exam Types
export type CognitiveLevel = 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' | 'Vận dụng cao';

export interface ExamQuestion {
  id: string;
  type: 'Trắc nghiệm' | 'Tự luận';
  level: CognitiveLevel;
  strand?: string;
  content: string;
  options?: string[];
  answer: string;
  explanation?: string;
  image?: string;
}

export interface ExamPaper {
  title: string;
  subject: string;
  grade: string;
  duration: number;
  questions: ExamQuestion[];
}

// Class Management Types
export interface Student {
  id: string;
  name: string;
  code: string;
  gender: 'Nam' | 'Nữ';
}

export interface Grade {
  studentId: string;
  score: string;
  feedback: string;
}

export interface SubmissionFile {
  name: string;
  size: string;
  type: string;
}

export interface SubmissionDetail {
  studentId: string;
  submittedAt: string;
  files: SubmissionFile[];
}

export interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  status: 'Đang mở' | 'Đã đóng';
  submissions: string[];
  submissionDetails?: SubmissionDetail[];
  grades: Grade[];
}

export interface AttendanceRecord {
  date: string;
  present: string[];
  absent: string[];
}

export interface DailyLogEntry {
  studentId: string;
  comment: string;
  type: 'praise' | 'mistake';
}

export interface DailyLog {
  date: string;
  entries: DailyLogEntry[];
}

export interface PeriodicEvaluation {
  subject?: string;
  competencies?: Record<number, string>;
  qualities?: Record<number, string>;
  compComment?: string;
  specComment?: string;
  qualComment?: string;
}

export interface Classroom {
  id: string;
  name: string;
  students: Student[];
  assignments: Assignment[];
  attendance: AttendanceRecord[];
  dailyLogs?: DailyLog[];
  periodicEvaluations?: Record<string, Record<string, PeriodicEvaluation>>;
}

// Cloud Storage Types
export interface CloudDocument {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
  size: string;
  isEncrypted?: boolean;
}

export type ViewType = 'chat' | 'classroom' | 'workspace' | 'exam' | 'worksheet' | 'cloud' | 'utility' | 'security' | 'practice';
