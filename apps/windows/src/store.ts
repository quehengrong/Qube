import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
export type ActionEvent={id:string;at:number;source:'desktop'|'phone';requestId:string;action:string;target:string;status:string;message:string};
export class Store {
 private db:DatabaseSync;
 constructor(path:string){this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,at INTEGER NOT NULL,json TEXT NOT NULL);');}
 get<T>(key:string):T|undefined{const row=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(String(row.value)):undefined;}
 put(key:string,value:unknown){this.db.prepare('INSERT INTO kv VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
 event(action:string,status:string,message:string,target='',requestId:string=randomUUID()){const event:ActionEvent={id:randomUUID(),at:Date.now(),source:'desktop',requestId,action,target,status,message};this.db.prepare('INSERT INTO events VALUES(?,?,?)').run(event.id,event.at,JSON.stringify(event));this.db.prepare('DELETE FROM events WHERE at<? OR id IN (SELECT id FROM events ORDER BY at DESC LIMIT -1 OFFSET 10000)').run(Date.now()-30*86400000);return event;}
 history(limit=100):ActionEvent[]{return this.db.prepare('SELECT json FROM events ORDER BY at DESC,rowid DESC LIMIT ?').all(limit).map(r=>JSON.parse(String(r.json)));}
 clearHistory(){this.db.exec('DELETE FROM events');}
 close(){this.db.close();}
}
