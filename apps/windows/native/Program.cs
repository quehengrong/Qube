using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Automation;

internal static class Program {
 [STAThread] static void Main(string[] args) {
  try {
   using var doc=JsonDocument.Parse(args.Single()); var r=doc.RootElement;
   var action=r.GetProperty("action").GetString();
   if(action is "foreground" or "selection" or "metrics" or "validate-window"){object data=action=="foreground"?Foreground():action=="selection"?Selection(r):action=="validate-window"?ValidateWindow(r):Metrics();Console.WriteLine(JsonSerializer.Serialize(new{ok=true,data}));return;}
   var message=action switch {
    "night" => Night(r), "music" => Music(r), "inspect" => Inspect(r),
    _ => throw new Exception("不支持的操作")
   };
   Console.WriteLine(JsonSerializer.Serialize(new {ok=true,message}));
  } catch(Exception e) { Console.WriteLine(JsonSerializer.Serialize(new {ok=false,message=e.Message})); }
 }
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int length);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint process);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
 [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out long idle,out long kernel,out long user);
 [StructLayout(LayoutKind.Sequential)] sealed class MemoryStatus {public uint length=(uint)Marshal.SizeOf<MemoryStatus>();public uint load;public ulong total,available,pageTotal,pageAvailable,virtualTotal,virtualAvailable,extended;}
 [DllImport("kernel32.dll",CharSet=CharSet.Auto)] static extern bool GlobalMemoryStatusEx([In,Out] MemoryStatus status);
 static object Foreground(){var hwnd=GetForegroundWindow();if(hwnd==IntPtr.Zero||IsIconic(hwnd))throw new Exception("没有可捕获的前台窗口");var name=new StringBuilder(1024);GetWindowText(hwnd,name,1024);GetWindowThreadProcessId(hwnd,out var pid);return new {handle=hwnd.ToInt64().ToString(),title=name.ToString(),pid};}
 static string ValidateWindow(JsonElement r){var hwnd=new IntPtr(long.Parse(r.GetProperty("handle").GetString()!));GetWindowThreadProcessId(hwnd,out var pid);if(pid==0||pid!=r.GetProperty("pid").GetInt32()||IsIconic(hwnd))throw new Exception("目标窗口已变化或已最小化，请重新选择");return "ok";}
 static string Selection(JsonElement r){
  AutomationElement? root=null;if(r.TryGetProperty("handle",out var h)&&h.ValueKind==JsonValueKind.String){ValidateWindow(r);root=AutomationElement.FromHandle(new IntPtr(long.Parse(h.GetString()!)));}else root=AutomationElement.FocusedElement;
  if(root==null)throw new Exception("没有选中文字的窗口");var selections=new List<string>();
  void Read(AutomationElement e){if(e.TryGetCurrentPattern(TextPattern.Pattern,out var p)){var text=string.Join("\n",((TextPattern)p).GetSelection().Select(x=>x.GetText(16000)));if(!string.IsNullOrWhiteSpace(text))selections.Add(text);}}
  Read(root);if(selections.Count==0)foreach(AutomationElement e in root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.IsTextPatternAvailableProperty,true))){Read(e);if(selections.Count>1)break;}
  if(selections.Count==1)return selections[0];throw new Exception("未找到唯一的选中文字，请复制后使用剪贴板");
 }
 static object Metrics(){
  if(!GetSystemTimes(out var i1,out var k1,out var u1))throw new Exception("无法读取 CPU");Thread.Sleep(300);GetSystemTimes(out var i2,out var k2,out var u2);var total=k2-k1+u2-u1;double? cpu=total>0?Math.Clamp(100.0*(total-(i2-i1))/total,0,100):null;
  var mem=new MemoryStatus();if(!GlobalMemoryStatusEx(mem))throw new Exception("无法读取内存");
  var processes=new List<object>();var rows=new List<(string name,int id,long bytes)>();foreach(var p in Process.GetProcesses()){using(p){try{rows.Add((p.ProcessName,p.Id,p.WorkingSet64));}catch{}}}foreach(var p in rows.OrderByDescending(p=>p.bytes).Take(5))processes.Add(new {p.name,p.id,p.bytes});
  object? gpu=null;string? gpuError=null;try{using var p=Process.Start(new ProcessStartInfo("nvidia-smi","--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits"){RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false,CreateNoWindow=true})!;var output=p.StandardOutput.ReadToEndAsync();if(!p.WaitForExit(3000)){p.Kill();throw new Exception("GPU 采样超时");}if(p.ExitCode!=0)throw new Exception("NVIDIA 驱动未提供数据");gpu=output.Result.Trim().Split('\n').Select(line=>{var cells=line.Split(',');double? Number(int x)=>double.TryParse(cells[x].Trim(),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out var n)?n:null;return new {utilization=Number(0),memoryUsedMB=Number(1),memoryTotalMB=Number(2),temperature=Number(3)};}).ToArray();}catch(Exception e){gpuError=e.Message;}
  return new {at=DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),cpu,memory=new {total=mem.total,used=mem.total-mem.available},processes,gpu,gpuError,cpuTemperature=(double?)null};
 }
 static AutomationElement? Window(string processName) {
  var ids=Process.GetProcessesByName(processName).Select(p=>p.Id).ToHashSet();
  foreach(AutomationElement e in AutomationElement.RootElement.FindAll(TreeScope.Children,Condition.TrueCondition))
   if(ids.Contains(e.Current.ProcessId))return e;
  return null;
 }
 static T Wait<T>(Func<T?> read,string error,int ms=8000) where T:class {
  var until=DateTime.UtcNow.AddMilliseconds(ms);
  while(DateTime.UtcNow<until){var value=read();if(value!=null)return value;Thread.Sleep(200);}throw new Exception(error);
 }
 static AutomationElement? Find(AutomationElement root,string name) {
  var list=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.NameProperty,name));
  var visible=new List<AutomationElement>();foreach(AutomationElement e in list)if(!e.Current.IsOffscreen&&e.Current.IsEnabled && (e.TryGetCurrentPattern(InvokePattern.Pattern,out _)||e.TryGetCurrentPattern(TogglePattern.Pattern,out _)||e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out _)))visible.Add(e);
  if(visible.Count>1)throw new Exception($"控件名称重复：{name}，请在设置中绑定唯一名称");return visible.SingleOrDefault();
 }
 static void Click(AutomationElement e) {
  if(e.TryGetCurrentPattern(InvokePattern.Pattern,out var invoke))((InvokePattern)invoke).Invoke();
  else if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out var select))((SelectionItemPattern)select).Select();
  else throw new Exception("控件不支持自动操作，请运行 inspect 检查客户端兼容性");
 }
 static string Night(JsonElement r) {
  Process.Start(new ProcessStartInfo("ms-settings:display"){UseShellExecute=true});
  var window=Wait(()=>Window("SystemSettings"),"未找到 Windows 设置窗口，请解锁电脑");
  var name=r.GetProperty("name").GetString()!;
  var toggle=Wait(()=>Find(window,name),$"未找到暖色开关：{name}。请检查设置中的控件名称");
  if(!toggle.TryGetCurrentPattern(TogglePattern.Pattern,out var pattern))throw new Exception("此控件不支持读取开关状态，未执行操作");
  var p=(TogglePattern)pattern;var wanted=r.GetProperty("enabled").GetBoolean()?ToggleState.On:ToggleState.Off;
  if(p.Current.ToggleState!=wanted)p.Toggle();
  Wait(()=>p.Current.ToggleState==wanted?toggle:null,"暖色开关未达到预期状态");
  return wanted==ToggleState.On?"已开启护眼暖色":"已关闭护眼暖色";
 }
 static string Music(JsonElement r) {
  var c=r.GetProperty("config");var process=c.GetProperty("processName").GetString()!;
  if(Window(process)==null){var path=c.GetProperty("path").GetString();if(string.IsNullOrWhiteSpace(path)||!File.Exists(path))throw new Exception("请在 Qube 设置中填写网易云音乐程序路径");Process.Start(new ProcessStartInfo(path){UseShellExecute=true});}
  var window=Wait(()=>Window(process),"网易云窗口未就绪，请先启动并登录客户端");
  if(window.TryGetCurrentPattern(WindowPattern.Pattern,out var wp))((WindowPattern)wp).SetWindowVisualState(WindowVisualState.Normal);
  string Name(string key)=>c.GetProperty(key).GetString()!;
  string command=r.GetProperty("command").GetString()!;
  var play=Name("playName");var pause=Name("pauseName");
  if(command=="daily"||command=="playlist") {
   string target;
   if(command=="daily")target=Name("dailyName");
   else {var alias=r.GetProperty("name").GetString()!;if(!c.GetProperty("playlists").TryGetProperty(alias,out var value))throw new Exception($"请先绑定收藏歌单：{alias}");target=value.GetString()!;}
   Click(Wait(()=>Find(window,target),$"找不到 {target}，请检查登录状态和客户端控件名称"));Thread.Sleep(500);
   Click(Wait(()=>Find(window,play),"未找到播放按钮，不能确认歌单已开始播放"));
   Wait(()=>Find(window,pause),"无法核实播放状态，请检查客户端适配");return $"已播放{target}";
  }
  if(command=="play"||command=="pause"){
   string desired=command=="play"?pause:play,action=command=="play"?play:pause;
   if(Find(window,desired)==null)Click(Wait(()=>Find(window,action),"未找到播放控制按钮"));
   Wait(()=>Find(window,desired),"无法核实播放状态");return command=="play"?"已开始播放":"已暂停音乐";
  }
  if(command=="next"||command=="previous"){
   // UIA does not expose a universal track identifier. Do not claim playback completion.
   Click(Wait(()=>Find(window,Name(command=="next"?"nextName":"previousName")),"未找到切歌按钮"));
   return "已操作切歌按钮，请以播放器显示为准";
  }
  throw new Exception("未知音乐操作");
 }
 static string Inspect(JsonElement r){
  var window=Wait(()=>Window(r.GetProperty("processName").GetString()!),"未找到窗口");
  var controls=new List<object>();foreach(AutomationElement e in window.FindAll(TreeScope.Descendants,Condition.TrueCondition)){
   if(!e.Current.IsOffscreen&&!string.IsNullOrWhiteSpace(e.Current.Name))controls.Add(new{name=e.Current.Name,id=e.Current.AutomationId,type=e.Current.ControlType.ProgrammaticName,patterns=e.GetSupportedPatterns().Select(p=>p.ProgrammaticName)});
  }return JsonSerializer.Serialize(controls);
 }
}
