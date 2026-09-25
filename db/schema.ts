// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const carts=sqliteTable('carts',{userId:text('user_id').primaryKey(),items:text('items').notNull(),updatedAt:integer('updated_at').notNull()});
export const orders=sqliteTable('orders',{id:text('id').primaryKey(),userId:text('user_id').notNull(),items:text('items').notNull(),total:integer('total').notNull(),status:text('status').notNull(),mode:text('mode').notNull(),sessionId:text('session_id'),createdAt:integer('created_at').notNull()},t=>[index('orders_user').on(t.userId)]);
export const entitlements=sqliteTable('entitlements',{userId:text('user_id').notNull(),productId:text('product_id').notNull(),orderId:text('order_id').notNull(),mode:text('mode').notNull(),createdAt:integer('created_at').notNull()},t=>[primaryKey({columns:[t.userId,t.productId]})]);
export const leads=sqliteTable('leads',{id:text('id').primaryKey(),userId:text('user_id').notNull(),data:text('data').notNull(),createdAt:integer('created_at').notNull()},t=>[index('leads_user').on(t.userId)]);
export const progress=sqliteTable('progress',{userId:text('user_id').notNull(),productId:text('product_id').notNull(),completed:text('completed').notNull()},t=>[primaryKey({columns:[t.userId,t.productId]})]);
export const events=sqliteTable('events',{id:text('id').primaryKey(),createdAt:integer('created_at').notNull()});
