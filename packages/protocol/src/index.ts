import { z } from 'zod';
export const PROTOCOL_VERSION = 2;
export const ReminderSchema = z.object({
  id:z.string().uuid(), title:z.string().trim().min(1).max(500),
  dueAt:z.number().int().positive(), advanceMinutes:z.number().int().min(0).max(10080),
  repeat:z.enum(['none','daily','weekly']), zone:z.literal('Asia/Shanghai'),
  status:z.enum(['active','notified','completed','cancelled','overdue','unscheduled']), revision:z.number().int().nonnegative(), important:z.boolean().default(false)
});
export type Reminder = z.infer<typeof ReminderSchema>;
const id = z.string().uuid();
export const ClientMessageSchema = z.discriminatedUnion('type', [
 z.object({id,type:z.literal('hello'),payload:z.object({token:z.string().min(32),version:z.union([z.literal(1),z.literal(2)]),capabilities:z.array(z.string().max(64)).max(32).optional()})}),
 z.object({id,type:z.literal('feature'),payload:z.object({action:z.enum(['recover-draft','undo','redo','capture','remove-attachment','apply-rewrite','discard-rewrite','helper','helper-cancel','helper-append','clipboard-append','selection-append','metrics','history','clear-history','scene','scene-retry','note-task','wake-config']),text:z.string().max(16000).optional(),target:z.string().max(200).optional(),revision:z.number().int().nonnegative().optional()})}),
 z.object({id,type:z.literal('local-result'),payload:z.object({ok:z.boolean(),message:z.string().max(1000)})}),
 z.object({id,type:z.literal('phone-events'),payload:z.object({events:z.array(z.object({id:z.string().uuid(),at:z.number().int(),source:z.literal('phone'),action:z.string().max(200),status:z.string().max(100),message:z.string().max(1000)})).max(100)})}),
 z.object({id,type:z.literal('wake'),payload:z.object({})}),
 z.object({id,type:z.literal('text'),payload:z.object({text:z.string().trim().min(1).max(16000)})}),
 z.object({id,type:z.literal('audio'),payload:z.object({pcm:z.string().max(2560000),sampleRate:z.literal(16000)})}),
 z.object({id,type:z.literal('select-session'),payload:z.object({sessionId:id})}),
 z.object({id,type:z.literal('draft-update'),payload:z.object({text:z.string().max(16000),revision:z.number().int().nonnegative()})}),
 z.object({id,type:z.literal('draft-submit'),payload:z.object({sessionId:id,revision:z.number().int().nonnegative()})}),
 z.object({id,type:z.literal('reminder-result'),payload:z.object({ok:z.boolean(),message:z.string().max(1000)})}),
 z.object({id,type:z.literal('ping'),payload:z.object({})})
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type FaceState='idle'|'listening'|'thinking'|'executing'|'success'|'error'|'offline'|'attention';
export type Attachment={id:string;name:string;path:string;preview:string;bytes:number;sha256:string};
export type Draft={text:string;revision:number;sessionId:string|null;mode:'command'|'dictation';confirmedConnection:boolean;attachments:Attachment[]};
export type AgentStatus='starting'|'idle'|'running'|'waiting_input'|'waiting_approval'|'completed'|'failed'|'interrupted'|'exited'|'unknown';
export type SessionInfo={id:string;name:string;environment:'wsl'|'powershell';agent:'codex'|'claude';cwd:string;alive:boolean;distribution?:string;status?:AgentStatus;detail?:string;enhanced?:boolean};
export type ServerMessage={id:string;type:'state'|'result'|'transcript'|'reminder-proposal'|'reminder-action'|'error'|'pong'|'local-command'|'agent-event'|'wake-config';payload:unknown};
