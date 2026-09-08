import { Router } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from './auth.js';
import { InterviewRecord } from './models/InterviewRecord.js';

export const interviewsRouter = Router();

interviewsRouter.post('/:roomId/complete', requireAuth, async (req, res) => {
  const { roomId } = req.params;
  const { score, feedback } = req.body ?? {};

  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 10) {
    res.status(400).json({ error: 'score must be an integer from 1 to 10' });
    return;
  }
  if (feedback !== undefined && typeof feedback !== 'string') {
    res.status(400).json({ error: 'feedback must be a string' });
    return;
  }

  const record = await InterviewRecord.findOne({ roomId });
  if (!record) {
    res.status(404).json({ error: 'No interview record for this room' });
    return;
  }
  // Only the interviewer who ran THIS interview can rate it - checked
  // against the authenticated user's id, not anything the client claims.
  if (record.interviewer.toString() !== req.userId) {
    res.status(403).json({ error: 'Only the interviewer can submit a rating for this room' });
    return;
  }

  record.score = score;
  record.feedback = typeof feedback === 'string' ? feedback : null;
  record.status = 'completed';
  record.completedAt = new Date();
  await record.save();

  res.json({
    roomId: record.roomId,
    status: record.status,
    score: record.score,
    feedback: record.feedback,
    completedAt: record.completedAt,
  });
});

export const usersRouter = Router();

interface PopulatedName {
  _id: Types.ObjectId;
  name: string;
}

usersRouter.get('/me/stats', requireAuth, async (req, res) => {
  const userId = req.userId!;

  const [interviewsGiven, interviewsTaken, scoreAgg, history] = await Promise.all([
    InterviewRecord.countDocuments({ interviewer: userId, status: 'completed' }),
    InterviewRecord.countDocuments({ candidate: userId, status: 'completed' }),
    InterviewRecord.aggregate<{ _id: null; avgScore: number }>([
      { $match: { candidate: new Types.ObjectId(userId), status: 'completed', score: { $ne: null } } },
      { $group: { _id: null, avgScore: { $avg: '$score' } } },
    ]),
    InterviewRecord.find({ $or: [{ interviewer: userId }, { candidate: userId }] })
      .sort({ createdAt: -1 })
      .limit(25)
      .populate<{ interviewer: PopulatedName; candidate: PopulatedName | null }>('interviewer', 'name')
      .populate<{ interviewer: PopulatedName; candidate: PopulatedName | null }>('candidate', 'name')
      .lean(),
  ]);

  res.json({
    interviewsGiven,
    interviewsTaken,
    averageScoreReceived: scoreAgg[0]?.avgScore ?? null,
    history: history.map((record) => {
      const isInterviewer = record.interviewer._id.toString() === userId;
      return {
        roomId: record.roomId,
        questionTitle: record.questionTitle,
        language: record.language,
        status: record.status,
        score: record.score,
        feedback: record.feedback,
        role: isInterviewer ? ('interviewer' as const) : ('candidate' as const),
        counterpartName: isInterviewer ? record.candidate?.name ?? 'Not yet joined' : record.interviewer.name,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
      };
    }),
  });
});