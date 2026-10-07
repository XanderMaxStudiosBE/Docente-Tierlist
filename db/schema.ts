import { sqliteTable, text, integer, primaryKey, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const votes = sqliteTable('votes', {
  voterId: text('voter_id').notNull(),
  teacherId: integer('teacher_id').notNull(),
  tier: text('tier').notNull(),
  roundId: text('round_id').notNull().default('initial'),
  classId: text('class_id').notNull().default('1ITF04'),
}, table => [
  primaryKey({columns:[table.voterId,table.teacherId]}),
  index('idx_votes_class_round_teacher_tier').on(table.classId,table.roundId,table.teacherId,table.tier),
  check('valid_teacher',sql`${table.teacherId} BETWEEN 1 AND 7`),
  check('valid_tier',sql`${table.tier} IN ('S','A','B','C','D','E','F')`),
]);
export const weeklyVotes = sqliteTable('weekly_votes', {
  classId: text('class_id').notNull().default('1ITF04'),
  voterId: text('voter_id').notNull(), teacherId: integer('teacher_id').notNull(),
  tier: text('tier').notNull(), roundId: text('round_id').notNull(), week: text('week').notNull(),
}, table => [primaryKey({columns:[table.voterId,table.teacherId,table.roundId,table.week]}),
  index('idx_weekly_class_round_week').on(table.classId,table.roundId,table.week),
  check('weekly_teacher',sql`${table.teacherId} BETWEEN 1 AND 7`),
  check('weekly_tier',sql`${table.tier} IN ('S','A','B','C','D','F')`)]);
export const duels = sqliteTable('duels', {
  classId: text('class_id').notNull().default('1ITF04'),
  voterId: text('voter_id').notNull(), roundId: text('round_id').notNull(),
  leftId: integer('left_id').notNull(), rightId: integer('right_id').notNull(), winnerId: integer('winner_id').notNull(),
}, table => [primaryKey({columns:[table.voterId,table.roundId,table.leftId,table.rightId]}),
  index('idx_duels_class_round_pair').on(table.classId,table.roundId,table.leftId,table.rightId),
  check('duel_pair',sql`${table.leftId} BETWEEN 1 AND 6 AND ${table.rightId} BETWEEN 2 AND 7 AND ${table.leftId} < ${table.rightId}`),
  check('duel_winner',sql`${table.winnerId} IN (${table.leftId},${table.rightId})`)]);
export const classSettings = sqliteTable('class_settings', {
  classId: text('class_id').primaryKey(), teacherNames: text('teacher_names').notNull(),
});
export const classRounds = sqliteTable('class_rounds', {
  classId: text('class_id').primaryKey(), roundId: text('round_id').notNull(),
});
export const adminAccount = sqliteTable('admin_account', {
  id: integer('id').primaryKey(), email: text('email').notNull(), passwordHash: text('password_hash').notNull(), salt: text('salt').notNull(),
},table=>[check('single_admin',sql`${table.id} = 1`)]);
export const adminSessions = sqliteTable('admin_sessions', {
  tokenHash: text('token_hash').primaryKey(), expiresAt: integer('expires_at').notNull(),
});
export const adminAttempts = sqliteTable('admin_attempts', {
  bucket: text('bucket').primaryKey(), attempts: integer('attempts').notNull(), windowStart: integer('window_start').notNull(),
});
export const teacherPhotos = sqliteTable('teacher_photos', {
  nameKey: text('name_key').primaryKey(), objectKey: text('object_key').notNull(), ownerHash: text('owner_hash').notNull(), uploadedAt: integer('uploaded_at').notNull(),
});
