"""Export v0.1/v0.2 debug app data before switching to the stable release signature.
Requires adb, USB debugging and the user's unlocked device. Does not uninstall anything.
The app is force-stopped for a consistent SQLite snapshot; reopen it after export.
"""
import argparse, json, pathlib, sqlite3, subprocess, tempfile
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('output',type=pathlib.Path,help='Backup JSON path outside the repository')
args=parser.parse_args()
if args.output.exists(): raise SystemExit('Output exists; choose a different file to preserve the backup')
package='io.qube.companion'
subprocess.run(['adb','shell','am','force-stop',package],check=True)
try:
 with tempfile.TemporaryDirectory(prefix='qube-phone-backup-') as directory:
  db=pathlib.Path(directory)/'qube-reminders.db'
  for suffix in ['', '-wal']:
   result=subprocess.run(['adb','exec-out','run-as',package,'cat','databases/qube-reminders.db'+suffix],capture_output=True)
   if result.returncode and suffix=='':raise RuntimeError('Cannot read app database; this script requires the old debug APK and an authorized USB connection')
   if result.returncode==0: pathlib.Path(str(db)+suffix).write_bytes(result.stdout)
  connection=sqlite3.connect(db);connection.row_factory=sqlite3.Row
  reminders=[dict(r) for r in connection.execute('SELECT * FROM reminders')]
  for r in reminders:r['important']=bool(r.get('important',False))
  records=[]
  if connection.execute("SELECT 1 FROM sqlite_master WHERE name='companion'").fetchone():records=[dict(r) for r in connection.execute("SELECT * FROM companion WHERE kind IN ('note','focus')")]
  connection.close()
  data={'version':2,'reminders':reminders,'records':records,'profile':{}}
  args.output.parent.mkdir(parents=True,exist_ok=True)
  with args.output.open('x',encoding='utf-8') as out:json.dump(data,out,ensure_ascii=False,indent=2)
  print(f'Exported {len(reminders)} reminders and {len(records)} companion records. No pairing credentials exported.')
finally:
 subprocess.run(['adb','shell','am','start','-n',package+'/.MainActivity'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
