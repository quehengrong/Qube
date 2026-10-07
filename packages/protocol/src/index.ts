import { z } from 'zod';
export const PROTOCOL_VERSION = 1;
export const ReminderSchema = z.object({
  id:z.string().uuid(), title:z.string().trim().min(1).max(500),
  dueAt:z.number().int().positive(), advanceMinutes:z.number().int().min(0).max(10080),
  repeat:z.enum(['none','daily','weekly']), zone:z.literal('Asia/Shanghai'),
  status:z.enum(['active','completed','cancelled']), revision:z.number().int().nonnegative()
});
export type Reminder = z.infer<typeof ReminderSchema>;
const id = z.string().uuid();
export const ClientMessageSchema = z.discriminatedUnion('type', [
 z.object({id,type:z.literal('hello'),payload:z.object({token:z.string().min(32),version:z.literal(1)})}),
 z.object({id,type:z.literal('text'),payload:z.object({text:z.string().trim().min(1).max(16000)})}),
 z.object({id,type:z.literal('audio'),payload:z.object({pcm:z.string().max(2560000),sampleRate:z.literal(16000)})}),
 z.object({id,type:z.literal('select-session'),payload:z.object({sessionId:id})}),
 z.object({id,type:z.literal('draft-update'),payload:z.object({text:z.string().max(16000),revision:z.number().int().nonnegative()})}),
 z.object({id,type:z.literal('draft-submit'),payload:z.object({sessionId:id,revision:z.number().int().nonnegative()})}),
 z.object({id,type:z.literal('reminder-result'),payload:z.object({ok:z.boolean(),message:z.string().max(1000)})}),
 z.object({id,type:z.literal('ping'),payload:z.object({})})
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type FaceState='idle'|'listening'|'thinking'|'executing'|'success'|'error'|'offline';
export type Draft={text:string;revision:number;sessionId:string|null;mode:'command'|'dictation';confirmedConnection:boolean};
export type SessionInfo={id:string;name:string;environment:'wsl'|'powershell';agent:'codex'|'claude';cwd:string;alive:boolean};
export type ServerMessage={id:string;type:'state'|'result'|'transcript'|'reminder-proposal'|'reminder-action'|'error'|'pong';payload:unknown};
