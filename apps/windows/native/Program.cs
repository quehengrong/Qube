using System.Diagnostics;
using System.Text.Json;
using System.Windows.Automation;

internal static class Program {
 [STAThread] static void Main(string[] args) {
  try {
   using var doc=JsonDocument.Parse(args.Single()); var r=doc.RootElement;
   var message=r.GetProperty("action").GetString() switch {
    "night" => Night(r), "music" => Music(r), "inspect" => Inspect(r),
    _ => throw new Exception("不支持的操作")
   };
   Console.WriteLine(JsonSerializer.Serialize(new {ok=true,message}));
  } catch(Exception e) { Console.WriteLine(JsonSerializer.Serialize(new {ok=false,message=e.Message})); }
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
  var visible=new List<AutomationElement>();foreach(AutomationElement e in list)if(!e.Current.IsOffscreen&&e.Current.IsEnabled)visible.Add(e);
  if(visible.Count>1)throw new Exception($"控件名称重复：{name}，请在设置中绑定唯一名称");return visible.SingleOrDefault();
 }
 static void Click(AutomationElement e) {
  if(e.TryGetCurrentPattern(InvokePattern.Pattern,out var invoke))((InvokePattern)invoke).Invoke();
  else if(e.TryGetCurrentPattern(SelectionItemPattern.Pattern,out var select))((SelectionItemPattern)select).Select();
  else throw new Exception("控件不支持自动操作，请运行 inspect 检查客户端兼容性");
 }
 static string Night(JsonElement r) {
  Process.Start(new ProcessStartInfo("ms-settings:nightlight"){UseShellExecute=true});
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
