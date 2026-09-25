// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,primaryKey,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const carts=sqliteTable('carts',{userId:text('user_id').primaryKey(),items:text('items').notNull(),updatedAt:integer('updated_at').notNull()});
export const orders=sqliteTable('orders',{id:text('id').primaryKey(),userId:text('user_id').notNull(),items:text('items').notNull(),total:integer('total').notNull(),status:text('status').notNull(),mode:text('mode').notNull(),sessionId:text('session_id'),createdAt:integer('created_at').notNull()},t=>[index('orders_user').on(t.userId)]);
export const entitlements=sqliteTable('entitlements',{userId:text('user_id').notNull(),productId:text('product_id').notNull(),orderId:text('order_id').notNull(),mode:text('mode').notNull(),createdAt:integer('created_at').notNull()},t=>[primaryKey({columns:[t.userId,t.productId]})]);
export const leads=sqliteTable('leads',{id:text('id').primaryKey(),userId:text('user_id').notNull(),data:text('data').notNull(),createdAt:integer('created_at').notNull()},t=>[index('leads_user').on(t.userId)]);
export const progress=sqliteTable('progress',{userId:text('user_id').notNull(),productId:text('product_id').notNull(),completed:text('completed').notNull()},t=>[primaryKey({columns:[t.userId,t.productId]})]);
export const events=sqliteTable('events',{id:text('id').primaryKey(),createdAt:integer('created_at').notNull()});
export const schools=sqliteTable('schools',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),name:text('name').notNull(),createdAt:integer('created_at').notNull(),
 customerId:text('customer_id'),subscriptionId:text('subscription_id'),status:text('status').notNull().default('none'),
 paidUntil:integer('paid_until').notNull().default(0),periodEnd:integer('period_end').notNull().default(0),
 cancelAtEnd:integer('cancel_at_end').notNull().default(0),syncedAt:integer('synced_at').notNull().default(0)
},t=>[uniqueIndex('schools_owner').on(t.ownerId),uniqueIndex('schools_customer').on(t.customerId),uniqueIndex('schools_subscription').on(t.subscriptionId)]);
export const schoolMembers=sqliteTable('school_members',{schoolId:text('school_id').notNull().references(()=>schools.id),userId:text('user_id').notNull(),name:text('name').notNull(),joinedAt:integer('joined_at').notNull()},t=>[primaryKey({columns:[t.schoolId,t.userId]}),index('school_members_user').on(t.userId)]);
export const schoolInvites=sqliteTable('school_invites',{id:text('id').primaryKey(),schoolId:text('school_id').notNull().references(()=>schools.id),tokenHash:text('token_hash').notNull(),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),acceptedBy:text('accepted_by'),revoked:integer('revoked').notNull().default(0)},t=>[uniqueIndex('school_invites_hash').on(t.tokenHash),index('school_invites_school').on(t.schoolId)]);
export const schoolCheckouts=sqliteTable('school_checkouts',{schoolId:text('school_id').primaryKey().references(()=>schools.id),attempt:text('attempt').notNull(),sessionId:text('session_id'),createdAt:integer('created_at').notNull()});
export const schoolLocks=sqliteTable('school_locks',{schoolId:text('school_id').primaryKey().references(()=>schools.id),token:text('token').notNull(),expiresAt:integer('expires_at').notNull()});
