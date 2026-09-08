import { Schema, model, Types, type HydratedDocument } from 'mongoose';

export interface InterviewRecordAttrs {
  roomId: string; // matches the in-memory RoomRecord.id from rooms.ts
  interviewer: Types.ObjectId;
  candidate: Types.ObjectId | null; // set the first time a non-interviewer joins the room
  questionId: string;
  questionTitle: string; // denormalized so history renders without re-looking-up the question bank
  language: string;
  status: 'in_progress' | 'completed';
  score: number | null; // 1-10, set only on completion
  feedback: string | null;
  completedAt: Date | null;
  createdAt: Date; // set automatically by { timestamps: true } below
  updatedAt: Date;
}

const interviewRecordSchema = new Schema<InterviewRecordAttrs>(
  {
    roomId: { type: String, required: true, unique: true, index: true },
    interviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    candidate: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    questionId: { type: String, required: true },
    questionTitle: { type: String, required: true },
    language: { type: String, required: true },
    status: { type: String, enum: ['in_progress', 'completed'], default: 'in_progress' },
    score: { type: Number, min: 1, max: 10, default: null },
    feedback: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type InterviewRecordDoc = HydratedDocument<InterviewRecordAttrs>;

export const InterviewRecord = model<InterviewRecordAttrs>('InterviewRecord', interviewRecordSchema);