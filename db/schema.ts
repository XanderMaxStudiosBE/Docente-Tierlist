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
  check('valid_teacher',sql`${table.teacherId} BETWEEN 1 AND 30`),
  check('valid_tier',sql`${table.tier} IN ('S','A','B','C','D','E','F')`),
]);
export const weeklyVotes = sqliteTable('weekly_votes', {
  classId: text('class_id').notNull().default('1ITF04'),
  voterId: text('voter_id').notNull(), teacherId: integer('teacher_id').notNull(),
  tier: text('tier').notNull(), roundId: text('round_id').notNull(), week: text('week').notNull(),
}, table => [primaryKey({columns:[table.voterId,table.teacherId,table.roundId,table.week]}),
  index('idx_weekly_class_round_week').on(table.classId,table.roundId,table.week),
  check('weekly_teacher',sql`${table.teacherId} BETWEEN 1 AND 30`),
  check('weekly_tier',sql`${table.tier} IN ('S','A','B','C','D','F')`)]);
export const duels = sqliteTable('duels', {
  classId: text('class_id').notNull().default('1ITF04'),
  voterId: text('voter_id').notNull(), roundId: text('round_id').notNull(),
  leftId: integer('left_id').notNull(), rightId: integer('right_id').notNull(), winnerId: integer('winner_id').notNull(),
}, table => [primaryKey({columns:[table.voterId,table.roundId,table.leftId,table.rightId]}),
  index('idx_duels_class_round_pair').on(table.classId,table.roundId,table.leftId,table.rightId),
  check('duel_pair',sql`${table.leftId} BETWEEN 1 AND 29 AND ${table.rightId} BETWEEN 2 AND 30 AND ${table.leftId} < ${table.rightId}`),
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

export const schoolYears = sqliteTable('school_years', {year:text('year').primaryKey()});
export const favorites = sqliteTable('favorites', {classId:text('class_id').notNull(),roundId:text('round_id').notNull(),voterId:text('voter_id').notNull(),teacherId:integer('teacher_id').notNull()},t=>[primaryKey({columns:[t.classId,t.roundId,t.voterId]}),check('favorite_teacher',sql`${t.teacherId} BETWEEN 1 AND 30`)]);
export const photoSubmissions = sqliteTable('photo_submissions', {objectKey:text('object_key').primaryKey(),nameKey:text('name_key').notNull(),teacherName:text('teacher_name').notNull(),ownerHash:text('owner_hash').notNull(),uploadedAt:integer('uploaded_at').notNull(),status:text('status').notNull()},t=>[index('idx_photo_status').on(t.status),check('photo_status',sql`${t.status} IN ('pending','approved','rejected')`)]);
export const memberAccounts = sqliteTable('member_accounts', {id:text('id').primaryKey(),email:text('email').notNull().unique(),passwordHash:text('password_hash').notNull(),salt:text('salt').notNull()});
export const memberSessions = sqliteTable('member_sessions', {tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull(),expiresAt:integer('expires_at').notNull()});
export const savedTierlists = sqliteTable('saved_tierlists', {accountId:text('account_id').notNull(),schoolYear:text('school_year').notNull(),classId:text('class_id').notNull(),ranking:text('ranking').notNull(),teacherNames:text('teacher_names')},t=>[primaryKey({columns:[t.accountId,t.schoolYear,t.classId]})]);
export const supportTickets = sqliteTable('support_tickets', {
  id:text('id').primaryKey(),accountId:text('account_id').notNull(),category:text('category').notNull(),title:text('title').notNull(),
  classId:text('class_id').notNull(),schoolYear:text('school_year').notNull(),status:text('status').notNull().default('open'),
  createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),revision:integer('revision').notNull().default(0),lastAction:text('last_action'),
},t=>[index('idx_tickets_account_created').on(t.accountId,t.createdAt,t.id),index('idx_tickets_status_created').on(t.status,t.createdAt,t.id),
  check('ticket_category',sql`${t.category} IN ('suggestion','complaint','bug')`),check('ticket_status',sql`${t.status} IN ('open','in_progress','closed')`)]);
export const ticketMessages = sqliteTable('ticket_messages', {
  id:text('id').primaryKey(),ticketId:text('ticket_id').notNull(),author:text('author').notNull(),message:text('message').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_ticket_messages_ticket_created').on(t.ticketId,t.createdAt,t.id),check('ticket_author',sql`${t.author} IN ('member','admin')`)]);
